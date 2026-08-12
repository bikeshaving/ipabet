# Builds the MSI. Run on Windows after a build:
#   .\windows\package.ps1
#
# WiX is a dotnet tool rather than a checked-in binary, so this installs it if
# it is missing and then gets out of the way.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root 'windows\build\Release'
$out = Join-Path $root 'windows\build\IPAbet.msi'

foreach ($f in @('ipabet.dll', 'ipabet.json', 'ipabet-register.exe')) {
    if (-not (Test-Path (Join-Path $bin $f))) {
        throw "missing $f — build first: cmake --build windows/build --config Release"
    }
}

# WiX 5, not the latest. From v6 the toolset requires accepting the Open Source
# Maintenance Fee EULA, which is a decision for the project's owner rather than
# for a build script. v5 is MIT and builds this installer perfectly well.
if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
    dotnet tool install --global wix --version "5.*" | Out-Host
    $env:PATH = "$env:PATH;$env:USERPROFILE\.dotnet\tools"
}

# The version lives in one place, and it is not this file.
$version = (Select-String -Path (Join-Path $root 'windows\CMakeLists.txt') `
    -Pattern 'project\(ipabet-tsf VERSION ([0-9.]+)').Matches[0].Groups[1].Value

# -arch x64, or WiX builds a 32-bit package and a 64-bit text service lands in
# the 32-bit Program Files, where a 64-bit host will not look for it.
wix build (Join-Path $root 'windows\installer\Product.wxs') `
    -arch x64 -d "BinDir=$bin" -d "Version=$version" -o $out | Out-Host

Write-Host "packaged: $out ($version)"
