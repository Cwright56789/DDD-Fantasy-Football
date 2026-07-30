<#
.SYNOPSIS
    Minimal static file server for local testing (no Node/Python required).
#>
param(
    [string]$RootDir = (Join-Path $PSScriptRoot ".."),
    [int]$Port = 8734
)

$RootDir = (Resolve-Path $RootDir).Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $RootDir at http://localhost:$Port/  (Ctrl+C to stop)"

$mime = @{
    ".html"="text/html"; ".css"="text/css"; ".js"="application/javascript";
    ".json"="application/json"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg";
    ".svg"="image/svg+xml"; ".ico"="image/x-icon"
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        try {
            $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
            if ($path -eq "/") { $path = "/index.html" }
            $filePath = Join-Path $RootDir ($path.TrimStart("/"))
            $filePath = $filePath -replace '/', '\'

            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
                $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $res.ContentType = $contentType
                $res.Headers.Add("Cache-Control", "no-store")
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
                $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
                $res.OutputStream.Write($msg, 0, $msg.Length)
            }
        } catch {
            $res.StatusCode = 500
            Write-Warning $_.Exception.Message
        } finally {
            $res.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
}
