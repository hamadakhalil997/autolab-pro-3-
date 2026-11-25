# AutoLab Pro — Windows Named-Pipe to Local HTTP Relay
# Auto-detects BOTH active Autocom bridge named pipes on Windows:
#   1) \\.\pipe\UniversalECU.AutocomCDP
#   2) \\.\pipe\AutoLabPro.AutocomCDP.v1
#
# Run on Windows (PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\AutocomLocalWebRelay.ps1

$CandidatePipes = @("UniversalECU.AutocomCDP", "AutoLabPro.AutocomCDP.v1")
$ListenUrl = "http://127.0.0.1:17455/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($ListenUrl)
$listener.Start()

Write-Host "[AutoLab Pro Relay] Listening on $ListenUrl" -ForegroundColor Cyan
Write-Host "[AutoLab Pro Relay] Scanning pipes: UniversalECU.AutocomCDP, AutoLabPro.AutocomCDP.v1" -ForegroundColor DarkCyan

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $resp = $context.Response
    $resp.Headers.Add("Access-Control-Allow-Origin", "*")
    $resp.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $resp.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    if ($req.HttpMethod -eq "OPTIONS") {
        $resp.StatusCode = 204
        $resp.Close()
        continue
    }

    try {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        if ([string]::IsNullOrWhiteSpace($body)) {
            $body = '{"command":"status"}'
        }

        $reqObj = $body | ConvertFrom-Json
        $pipesToTry = $CandidatePipes
        if ($reqObj.PSObject.Properties.Name -contains "pipeName" -and -not [string]::IsNullOrWhiteSpace($reqObj.pipeName) -and $reqObj.pipeName -ne "Auto") {
            $pipesToTry = @($reqObj.pipeName)
        }

        # Clean pipeName helper property before forwarding to C# Bridge PipeRequest
        $forwardHash = @{}
        foreach ($prop in $reqObj.PSObject.Properties) {
            if ($prop.Name -ne "pipeName") {
                $forwardHash[$prop.Name] = $prop.Value
            }
        }
        $forwardJson = $forwardHash | ConvertTo-Json -Compress

        $pipeJson = $null
        $matchedPipe = $null
        $lastErr = $null

        foreach ($pipeName in $pipesToTry) {
            try {
                $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::Asynchronous)
                $pipe.Connect(1200)
                $pipeWriter = New-Object System.IO.StreamWriter($pipe, (New-Object System.Text.UTF8Encoding($false)), 1024, $true)
                $pipeWriter.AutoFlush = $true
                $pipeReader = New-Object System.IO.StreamReader($pipe, [System.Text.Encoding]::UTF8, $false, 1024, $true)

                $pipeWriter.WriteLine($forwardJson)
                $pipeJson = $pipeReader.ReadLine()
                $pipe.Dispose()
                $matchedPipe = $pipeName
                break
            }
            catch {
                $lastErr = $_.Exception.Message
            }
        }

        if ([string]::IsNullOrWhiteSpace($pipeJson)) {
            throw "No bridge pipe responded ($lastErr)"
        }

        $parsed = $pipeJson | ConvertFrom-Json
        if (-not ($parsed.PSObject.Properties.Name -contains "bridgeOnline")) {
            $parsed | Add-Member -NotePropertyName "bridgeOnline" -NotePropertyValue $true
        }
        if (-not ($parsed.PSObject.Properties.Name -contains "activePipe")) {
            $parsed | Add-Member -NotePropertyName "activePipe" -NotePropertyValue $matchedPipe
        }
        $outJson = $parsed | ConvertTo-Json -Depth 6 -Compress

        $bytes = [System.Text.Encoding]::UTF8.GetBytes($outJson)
        $resp.ContentType = "application/json; charset=utf-8"
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    catch {
        $errObj = @{
            success = $false
            bridgeOnline = $false
            connected = $false
            activePipe = $null
            ftStatus = "BRIDGE_OFFLINE"
            deviceCount = 0
            pendingRxBytes = 0
            errorCode = "BRIDGE_OFFLINE"
            error = $_.Exception.Message
            message = "Named pipes unavailable: $($_.Exception.Message)"
        } | ConvertTo-Json -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($errObj)
        $resp.ContentType = "application/json; charset=utf-8"
        $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    finally {
        $resp.Close()
    }
}
