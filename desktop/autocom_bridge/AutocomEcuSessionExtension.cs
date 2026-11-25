using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace UniversalECU.Infrastructure.AutocomExtension
{
    /// <summary>
    /// Extends the existing AutoLabPro.AutocomCDP.v1 Named-Pipe contract
    /// (which previously stopped at ConnectVci -> "WAITING FOR ECU")
    /// with explicit 1980-2026 ECU session discovery and frame transceive methods.
    /// </summary>
    public sealed record VehicleBusTarget(
        string Make,
        string Model,
        int Year,
        string EcuName,
        string Protocol,
        uint TxId,
        uint RxId,
        uint BaudRate);

    public sealed record EcuSessionResponse(
        bool Success,
        bool SessionActive,
        string EcuStatusText,
        string? VerifiedVin,
        string? SwVersion,
        string? ErrorCode,
        string? Message);

    public static class VehicleProtocolResolver
    {
        public static VehicleBusTarget ResolveForYear(string make, string model, int year, string ecuName)
        {
            if (year <= 1995)
            {
                return new VehicleBusTarget(make, model, year, ecuName, "ISO9141_KLINE", 0x01, 0xF1, 10400);
            }
            if (year <= 2004)
            {
                return new VehicleBusTarget(make, model, year, ecuName, "KWP2000_ISO14230", 0x7E0, 0x7E8, 10400);
            }
            if (year <= 2017)
            {
                return new VehicleBusTarget(make, model, year, ecuName, "UDS_ISO15765_CAN500", 0x7E0, 0x7E8, 500000);
            }
            return new VehicleBusTarget(make, model, year, ecuName, "CANFD_DOIP_ISO14229", 0x7E0, 0x7E8, 2000000);
        }
    }

    /// <summary>
    /// Drop-in extension methods for AutocomBridgeClient (NamedPipe: AutoLabPro.AutocomCDP.v1)
    /// and corresponding handler skeleton for AutocomCdpBridge\Program.cs.
    /// </summary>
    public sealed class AutocomEcuSessionController
    {
        public const string PipeName = "AutoLabPro.AutocomCDP.v1";

        public string BuildOpenEcuSessionJson(VehicleBusTarget target)
        {
            var payload = new Dictionary<string, object>
            {
                ["command"] = "open_ecu_session",
                ["make"] = target.Make,
                ["model"] = target.Model,
                ["year"] = target.Year,
                ["ecu"] = target.EcuName,
                ["protocol"] = target.Protocol,
                ["tx_id"] = $"0x{target.TxId:X3}",
                ["rx_id"] = $"0x{target.RxId:X3}",
                ["baud_rate"] = target.BaudRate,
                ["init_frames"] = new[] { "10 03", "22 F1 90" }
            };
            return JsonSerializer.Serialize(payload);
        }

        public string BuildEcuTransceiveJson(uint txId, string hexPayload)
        {
            var payload = new Dictionary<string, object>
            {
                ["command"] = "ecu_transceive",
                ["tx_id"] = $"0x{txId:X3}",
                ["data"] = hexPayload.Trim().ToUpperInvariant()
            };
            return JsonSerializer.Serialize(payload);
        }

        /// <summary>
        /// Server-side dispatch addition for AutocomCdpBridge\Program.cs:
        /// switch (command) {
        ///   case "open_ecu_session": return OpenEcuSession(request);
        ///   case "ecu_transceive":   return EcuTransceive(request);
        /// }
        /// Once OpenEcuSession receives positive UDS 0x50 03 & VIN 0x62 F1 90,
        /// MainWindow.xaml.cs transitions EcuStatusText from "WAITING FOR ECU" -> "ECU ONLINE".
        /// </summary>
        public EcuSessionResponse ParseResponse(string jsonLine)
        {
            return JsonSerializer.Deserialize<EcuSessionResponse>(
                       jsonLine,
                       new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                   ?? new EcuSessionResponse(false, false, "WAITING FOR ECU", null, null, "DECODE_ERROR", "Empty response");
        }
    }
}
