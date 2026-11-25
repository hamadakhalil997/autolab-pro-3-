#nullable disable
using System;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Reflection;
using System.Text;
using Newtonsoft.Json;
using VciDrivers;
using VciDrivers.Drivers;
using VciDrivers.Types;

namespace UniversalECU.AutocomBridge
{
    /// <summary>
    /// Optional enhanced drop-in upgrade for UniversalECU.AutocomCDP Program.cs
    /// adding read_adapter (serial, obd_firmware, eobd_firmware, platform, communication_status)
    /// and capabilities using strictly verified VciDrivers SDK APIs.
    /// </summary>
    internal static class Program
    {
        private const string PipeName = "UniversalECU.AutocomCDP";
        private const string SerialNumber = "FTXO5VO2";
        private const string VendorPath = @"C:\Program Files (x86)\Autocom 2021.11 Software";

        private static readonly object StateLock = new object();
        private static IVciDriver _driver;
        private static bool _running = true;

        private static void Main()
        {
            try
            {
                ConfigureVendorResolution();
                Console.WriteLine("UniversalECU Autocom VCI Bridge (Pipe: " + PipeName + ")");
                Console.WriteLine("Transport: Official Autocom VCI SDK (FTDI USB Filter: " + SerialNumber + ")");
                RunPipeServer();
            }
            catch (Exception ex)
            {
                Console.WriteLine("FATAL: " + ex);
            }
            finally
            {
                DisconnectVci();
            }
        }

        private static void ConfigureVendorResolution()
        {
            string nativePath = Path.Combine(VendorPath, "USB-driver", "i386");
            string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            Environment.SetEnvironmentVariable("PATH", VendorPath + ";" + nativePath + ";" + currentPath);

            AppDomain.CurrentDomain.AssemblyResolve += (sender, args) =>
            {
                string name = new AssemblyName(args.Name).Name;
                if (string.Equals(name, "Newtonsoft.Json", StringComparison.OrdinalIgnoreCase))
                    return null;
                string candidate = Path.Combine(VendorPath, name + ".dll");
                return File.Exists(candidate) ? Assembly.LoadFrom(candidate) : null;
            };
        }

        private static void RunPipeServer()
        {
            while (_running)
            {
                using (var pipe = new NamedPipeServerStream(
                    PipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.None))
                {
                    pipe.WaitForConnection();
                    try
                    {
                        using (var reader = new StreamReader(pipe, Encoding.UTF8, false, 1024, true))
                        using (var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, true))
                        {
                            writer.AutoFlush = true;
                            string line;
                            while (_running && (line = reader.ReadLine()) != null)
                            {
                                bool exitRequested;
                                BridgeResponse response = ProcessRequest(line, out exitRequested);
                                writer.WriteLine(JsonConvert.SerializeObject(response));
                                if (exitRequested)
                                {
                                    _running = false;
                                    break;
                                }
                            }
                        }
                    }
                    catch (IOException) { }
                    catch (ObjectDisposedException) { }
                }
            }
        }

        private static BridgeResponse ProcessRequest(string json, out bool exitRequested)
        {
            exitRequested = false;
            try
            {
                PipeRequest request = JsonConvert.DeserializeObject<PipeRequest>(json);
                string command = request == null || request.Command == null
                    ? ""
                    : request.Command.Trim().ToLowerInvariant();

                switch (command)
                {
                    case "status":
                        return GetStatus();
                    case "capabilities":
                        return GetCapabilities();
                    case "enumerate":
                        return EnumerateDevices();
                    case "connect":
                        return ConnectVci();
                    case "disconnect":
                        return DisconnectVci();
                    case "read_adapter":
                        return ReadAdapter(request.Operation);
                    case "exit":
                        BridgeResponse result = DisconnectVci();
                        exitRequested = true;
                        result.Message = "Bridge shutdown requested.";
                        return result;
                    default:
                        return Failure("Unknown command: " + command);
                }
            }
            catch (Exception ex)
            {
                return Failure(ex.ToString());
            }
        }

        private static BridgeResponse GetCapabilities()
        {
            return new BridgeResponse
            {
                Success = true,
                Connected = IsConnected(),
                FtStatus = IsConnected() ? "VCI_CONNECTED" : "VCI_DISCONNECTED",
                DeviceCount = CountTargetDevices(),
                PendingRxBytes = SafePendingBytes(),
                Message = "Bridge capabilities retrieved.",
                SupportedOperations = new[]
                {
                    "status", "capabilities", "enumerate", "connect", "disconnect",
                    "read_adapter:serial", "read_adapter:obd_firmware",
                    "read_adapter:eobd_firmware", "read_adapter:platform",
                    "read_adapter:communication_status"
                },
                DisabledOperations = new[] { "ecu_commands (requires protocol frame SDK)" }
            };
        }

        private static BridgeResponse EnumerateDevices()
        {
            lock (StateLock)
            {
                try
                {
                    var target = FindTargetDevice();
                    bool conn = IsConnected();
                    return new BridgeResponse
                    {
                        Success = true,
                        Connected = conn,
                        FtStatus = conn ? "VCI_CONNECTED" : "VCI_DISCONNECTED",
                        DeviceCount = target == null ? 0 : 1,
                        PendingRxBytes = SafePendingBytes(),
                        Message = target == null
                            ? "Autocom CDP+ not found in VCI device list."
                            : "Autocom CDP+ detected: " + target.Description
                    };
                }
                catch (Exception ex)
                {
                    return Failure("VCI enumeration failed: " + ex.Message);
                }
            }
        }

        private static BridgeResponse ConnectVci()
        {
            lock (StateLock)
            {
                try
                {
                    if (IsConnected())
                        return GetStatus("VCI is already connected.");

                    var target = FindTargetDevice();
                    if (target == null)
                        return Failure("Autocom CDP+ with serial " + SerialNumber + " was not found.");

                    var config = new VciDriverConfiguration(DriverFamily.Cdp, new[] { ConnectionMethod.DeviceDescription })
                    {
                        DeviceDescription = target.Description
                    };

                    var library = new DriverLibrary();
                    IVciDriver candidate = library.CreateDrivers(config).FirstOrDefault();
                    if (candidate == null)
                        return Failure("The Autocom SDK did not create a CDP driver.");

                    var result = candidate.Connect();
                    if (!result.Succeeded || !candidate.IsConnected)
                    {
                        string error = result.Error == null ? "SDK connection failed." : result.Error.ErrorMessage;
                        try { candidate.Disconnect(); } catch { }
                        return Failure(error);
                    }

                    _driver = candidate;
                    return GetStatus("Official Autocom VCI connection established.");
                }
                catch (Exception ex)
                {
                    _driver = null;
                    return Failure("VCI connection exception: " + ex.Message);
                }
            }
        }

        private static BridgeResponse ReadAdapter(string operationRaw)
        {
            lock (StateLock)
            {
                if (!IsConnected())
                    return Failure("Connect the VCI before reading adapter information.");

                string op = (operationRaw ?? "").Trim().ToLowerInvariant();
                VciCommand cmd;
                switch (op)
                {
                    case "serial": cmd = VciCommand.ReadSerial; break;
                    case "obd_firmware": cmd = VciCommand.ObdFirmVersion; break;
                    case "eobd_firmware": cmd = VciCommand.EobdFirmVersion; break;
                    case "platform": cmd = VciCommand.ReadPlatformName; break;
                    case "communication_status": cmd = VciCommand.CheckCommunicationStatus; break;
                    default:
                        return Failure("Unsupported read_adapter operation: " + op);
                }

                var result = _driver.SendVciCommand(cmd);
                if (!result.Succeeded || result.Value == null)
                    return Failure(result.Error == null ? "Adapter read failed." : result.Error.ErrorMessage);

                string val = !string.IsNullOrWhiteSpace(result.Value.Response)
                    ? result.Value.Response
                    : result.Value.RawResponse;

                return new BridgeResponse
                {
                    Success = true,
                    Connected = true,
                    FtStatus = "VCI_CONNECTED",
                    DeviceCount = 1,
                    PendingRxBytes = SafePendingBytes(),
                    Operation = op,
                    Value = val,
                    Message = "Adapter read completed."
                };
            }
        }

        private static BridgeResponse DisconnectVci()
        {
            lock (StateLock)
            {
                try
                {
                    if (_driver != null)
                    {
                        IVciDriver current = _driver;
                        _driver = null;
                        current.Disconnect();
                    }
                    return GetStatus("VCI disconnected.");
                }
                catch (Exception ex)
                {
                    _driver = null;
                    return Failure("VCI disconnect failed: " + ex.Message);
                }
            }
        }

        private static VciDrivers.VciLink.VciLinkDeviceInfo FindTargetDevice()
        {
            return DeviceList.GetVciLinkDevices().FirstOrDefault(d =>
                string.Equals(d.FtdiSerial, SerialNumber, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(d.ConnectionType, "FTDI_USB", StringComparison.OrdinalIgnoreCase));
        }

        private static int CountTargetDevices()
        {
            try { return FindTargetDevice() == null ? 0 : 1; } catch { return 0; }
        }

        private static int SafePendingBytes()
        {
            try { return _driver != null && _driver.IsConnected ? (int)Math.Min(_driver.NumberOfBytesToRead(), int.MaxValue) : 0; }
            catch { return 0; }
        }

        private static bool IsConnected()
        {
            if (_driver == null) return false;
            try
            {
                if (!_driver.IsConnected || FindTargetDevice() == null)
                {
                    IVciDriver oldDriver = _driver;
                    _driver = null;
                    try { oldDriver.Disconnect(); } catch { }
                    return false;
                }
                return true;
            }
            catch { return false; }
        }

        private static BridgeResponse GetStatus(string message = null)
        {
            bool connected = IsConnected();
            return new BridgeResponse
            {
                Success = true,
                Connected = connected,
                FtStatus = connected ? "VCI_CONNECTED" : "VCI_DISCONNECTED",
                DeviceCount = CountTargetDevices(),
                PendingRxBytes = SafePendingBytes(),
                Message = message ?? (connected ? "VCI connected." : "VCI disconnected.")
            };
        }

        private static BridgeResponse Failure(string error)
        {
            bool connected = IsConnected();
            return new BridgeResponse
            {
                Success = false,
                Connected = connected,
                FtStatus = connected ? "VCI_CONNECTED" : "VCI_DISCONNECTED",
                DeviceCount = 0,
                PendingRxBytes = 0,
                Message = "Operation failed.",
                Error = error
            };
        }

        private sealed class PipeRequest
        {
            public string Command { get; set; }
            public string Operation { get; set; }
        }

        private sealed class BridgeResponse
        {
            public bool Success { get; set; }
            public bool Connected { get; set; }
            public string FtStatus { get; set; }
            public int DeviceCount { get; set; }
            public int PendingRxBytes { get; set; }
            public string Message { get; set; }
            public string Error { get; set; }
            public string Operation { get; set; }
            public string Value { get; set; }
            public string[] SupportedOperations { get; set; }
            public string[] DisabledOperations { get; set; }
        }
    }
}
