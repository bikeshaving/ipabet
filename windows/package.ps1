# Builds the MSI. Run on Windows after a build:
#   .\windows\package.ps1
#
# WiX is a dotnet tool rather than a checked-in binary, so this installs it if
# it is missing and then gets out of the way.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root 'windows\build\Release'

# The installer carries a text service, and TSF loads that DLL into every
# client process — so an x64 build is not merely suboptimal on an ARM machine,
# it cannot load into a native ARM application at all. One installer per
# architecture, named so nobody has to guess which they have.
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$out = Join-Path $root "windows\build\IPAbet-$arch.msi"

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

# Never the default: WiX builds a 32-bit package unless told otherwise, and a
# 64-bit text service then lands in the 32-bit Program Files where a 64-bit host
# will not look for it.
wix build (Join-Path $root 'windows\installer\Product.wxs') `
    -arch $arch -d "BinDir=$bin" -d "Version=$version" -o $out | Out-Host

Write-Host "packaged: $out ($version, $arch)"
