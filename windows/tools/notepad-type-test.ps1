# Replays parity vectors as real keystrokes into Notepad, through the registered
# text service, and reads back what Notepad ended up holding.
#
# The corpus, not a handful of cases someone thought to write. Nearly a quarter
# of the vectors use the diacritic layer, and when this test had four hand-picked
# cases it covered none of them — the layer could have been dead in a shipped
# build and nothing here would have said so.
#
# A real application rather than a purpose-built one: what needs proving is the
# lookback, which needs a document that survives from one keystroke to the next.
# The text comes back through the clipboard because Ctrl+A, Ctrl+C is two
# keystrokes IPAbet declines and every Notepad understands.

param(
    [int]$Count = 60,
    # "option" runs only the vectors that use the diacritic layer.
    [string]$Only = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\sendinput.ps1"

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$vectors = Get-Content (Join-Path $repo 'spec\parity-vectors.json') -Raw | ConvertFrom-Json

# Vector key labels are what the engine sees, which is not always the key a
# person presses: "H" is Shift+h, "|" is Shift+backslash.
$VK = @{}
foreach ($c in [char[]]'abcdefghijklmnopqrstuvwxyz') { $VK["$c"] = [int][char]([string]$c).ToUpper() }
foreach ($c in [char[]]'0123456789') { $VK["$c"] = [int][char]$c }
$VK[' '] = 0x20; $VK['Escape'] = 0x1B; $VK[[string][char]0x232B] = 0x08
$VK[';'] = 0xBA; $VK['='] = 0xBB; $VK[','] = 0xBC; $VK['-'] = 0xBD
$VK['.'] = 0xBE; $VK['/'] = 0xBF; $VK['`'] = 0xC0; $VK['['] = 0xDB
$VK['\'] = 0xDC; $VK[']'] = 0xDD; $VK["'"] = 0xDE
# Labels that only exist on a shifted key.
$SHIFTED = @{ '|' = 0xDC }

function Resolve-Key($k) {
    $label = $k.key
    $shift = [bool]$k.shift
    if ($SHIFTED.ContainsKey($label)) { return @{ vk = $SHIFTED[$label]; shift = $true } }
    if ($label.Length -eq 1 -and [char]::IsUpper($label[0])) {
        return @{ vk = $VK[$label.ToLower()]; shift = $true }
    }
    if (-not $VK.ContainsKey($label)) { return $null }
    return @{ vk = $VK[$label]; shift = $shift }
}

function Test-Typeable($v) {
    foreach ($k in $v.keys) { if ($null -eq (Resolve-Key $k)) { return $false } }
    return $true
}

$eligible = $vectors | Where-Object {
    $_.initial -eq '' -and $_.locale -eq 'en' -and -not $_.capital_digraphs
} | Where-Object { Test-Typeable $_ }

if ($Only -eq 'option') {
    $eligible = $eligible | Where-Object { $_.keys | Where-Object { $_.option } }
    Write-Host "$($eligible.Count) vectors use the diacritic layer"
}

# A spread across the corpus rather than the first N, which all come from the
# same test file and exercise the same few rules.
$step = [Math]::Max(1, [int]($eligible.Count / $Count))
$sample = @($eligible)[0..($eligible.Count - 1)] | Where-Object { $eligible.IndexOf($_) % $step -eq 0 } |
    Select-Object -First $Count

$notepad = Start-Process notepad -PassThru
Start-Sleep -Seconds 3
$notepad.Refresh()
if ($notepad.MainWindowHandle -eq 0) { throw "Notepad has no window" }
if (-not [Input]::Foreground($notepad.MainWindowHandle, 8000)) { throw "Notepad would not take the foreground" }
Start-Sleep -Milliseconds 500

$failures = @()
foreach ($v in $sample) {
    [Input]::Press(0x41, $false, $true)   # Ctrl+A
    [Input]::Press(0x2E, $false, $false)  # Delete
    Start-Sleep -Milliseconds 150

    foreach ($k in $v.keys) {
        $r = Resolve-Key $k
        # The diacritic layer is AltGr here, which Windows reports as Ctrl+Alt —
        # plain Alt belongs to the menu bar and never reaches a text service.
        [Input]::PressWithAlt($r.vk, $r.shift, [bool]$k.option)
    }
    # Composed text is not committed text, and the clipboard only gets the
    # latter. Enter is a key IPAbet declines, so the client takes the run.
    [Input]::Press(0x0D, $false, $false)
    Start-Sleep -Milliseconds 250

    Set-Clipboard -Value ''
    [Input]::Press(0x41, $false, $true)
    [Input]::Press(0x43, $false, $true)
    Start-Sleep -Milliseconds 250
    $got = (Get-Clipboard) -replace "`r|`n", ''

    if ($got -cne $v.expected) {
        $keys = ($v.keys | ForEach-Object {
            $m = ''
            if ($_.option) { $m += 'AltGr+' }
            if ($_.shift) { $m += 'Shift+' }
            $m + $_.key
        }) -join ' '
        $failures += [pscustomobject]@{ keys = $keys; expected = $v.expected; got = $got }
    }
}

Stop-Process -Id $notepad.Id -Force -ErrorAction SilentlyContinue

Write-Host "ran $($sample.Count) vectors, $($failures.Count) failed"
$failures | Select-Object -First 15 | ForEach-Object {
    Write-Host "  keys=$($_.keys) expected='$($_.expected)' got='$($_.got)'"
}
if ($failures.Count) { exit 1 }
exit 0
