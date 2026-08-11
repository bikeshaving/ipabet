# Types IPAbet into Notepad and reads back what Notepad ended up holding.
#
# A real application rather than a purpose-built one, because the part that was
# never in doubt is whether the text service runs -- what needs proving is the
# lookback, and that needs a document that survives from one keystroke to the
# next. Writing a text store to test against would be testing the test.
#
# The text comes back through the clipboard rather than through UI Automation:
# Ctrl+A, Ctrl+C is two keystrokes IPAbet declines and Notepad understands, and
# it does not care which Notepad this Windows shipped with.
#
# Exit 0 if every case produced what the engine says it should.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\sendinput.ps1"

$cases = @(
    @{ name = 't then shift-H';  keys = @(@{k=0x54}, @{k=0x48; shift=$true}); expected = [char]0x03B8 }  # θ
    @{ name = 's then shift-H';  keys = @(@{k=0x53}, @{k=0x48; shift=$true}); expected = [char]0x0283 }  # ʃ
    @{ name = '5 then shift-H';  keys = @(@{k=0x35}, @{k=0x48; shift=$true}); expected = [char]0x0259 }  # ə
    @{ name = 'plain letters';   keys = @(@{k=0x4D}, @{k=0x41});              expected = 'ma' }
)

$notepad = Start-Process notepad -PassThru
Start-Sleep -Seconds 3
$notepad.Refresh()
$hwnd = $notepad.MainWindowHandle
if ($hwnd -eq 0) { throw "Notepad has no window" }

Write-Host "station:    $([Input]::StationName())"
if (-not [Input]::Foreground($hwnd, 8000)) { throw "could not bring Notepad to the foreground" }
Start-Sleep -Milliseconds 500

$failures = 0
foreach ($c in $cases) {
    # Clear whatever the last case left: select all, then delete.
    [Input]::Press(0x41, $false, $true)   # Ctrl+A
    [Input]::Press(0x2E, $false, $false)  # Delete
    Start-Sleep -Milliseconds 200

    foreach ($k in $c.keys) {
        [Input]::Press($k.k, [bool]$k.shift, $false)
    }
    # Composed text is not committed text, and the clipboard only gets the
    # latter. Enter is a key IPAbet declines, so the client takes the run.
    [Input]::Press(0x0D, $false, $false)
    Start-Sleep -Milliseconds 400

    Set-Clipboard -Value ''
    [Input]::Press(0x41, $false, $true)   # Ctrl+A
    [Input]::Press(0x43, $false, $true)   # Ctrl+C
    Start-Sleep -Milliseconds 400
    $got = (Get-Clipboard) -replace "`r|`n", ''

    $ok = $got -ceq [string]$c.expected
    if (-not $ok) { $failures++ }
    $verdict = if ($ok) { 'PASS' } else { 'FAIL' }
    Write-Host "$verdict $($c.name): expected '$($c.expected)' got '$got'"
}

Stop-Process -Id $notepad.Id -Force -ErrorAction SilentlyContinue
Write-Host "$($cases.Count) cases, $failures failed"
if ($failures) { exit 1 }
exit 0
