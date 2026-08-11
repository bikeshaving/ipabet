# Can synthetic keystrokes drive a real Windows text field, on this machine?
#
# This asks nothing about IPAbet. It asks whether the harness a Windows E2E gate
# would be built on works at all here — SendInput at the bottom of the input
# stack, a real focused window, and the text read back out of the control. The
# answer decides whether the Windows port can be gated in CI the way the Linux
# one is, or whether it needs an interactive VM.
#
# Scancode injection, not KEYEVENTF_UNICODE: Unicode injection hands a character
# straight to the target and skips the keyboard layout and the text services
# that sit above it, which are exactly the layers a text service lives in.
#
# Exit 0 if the field received what was typed, 1 otherwise.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
. "$PSScriptRoot\sendinput.ps1"

$expected = 'ipabet spike'
$form = New-Object Windows.Forms.Form
$form.Text = 'ipabet-test-entry'
$form.TopMost = $true
$box = New-Object Windows.Forms.TextBox
$box.Dock = 'Fill'
$form.Controls.Add($box)

$script:got = $null
$form.Add_Shown({
    $form.Activate()
    $box.Focus() | Out-Null
    [Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 500

    $focused = [Input]::Foreground($form.Handle, 5000)

    # Printed whether or not the run passes: a failure is only actionable if it
    # says which of the preconditions was missing.
    Write-Host "interactive:  $([Windows.Forms.SystemInformation]::UserInteractive)"
    Write-Host "station:      $([Input]::StationName())"
    Write-Host "foreground:   $([Input]::GetForegroundWindow()) (form is $($form.Handle), acquired: $focused)"

    [Input]::Type($expected)

    # Let the queued input drain before reading the control.
    for ($i = 0; $i -lt 40; $i++) {
        [Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 50
    }
    $script:got = $box.Text
    $form.Close()
})

[Windows.Forms.Application]::Run($form)

Write-Host "expected: '$expected'"
Write-Host "got:      '$script:got'"
if ($script:got -eq $expected) {
    Write-Host 'PASS - synthetic keystrokes reach a real text field here.'
    exit 0
}
Write-Host 'FAIL - synthetic keystrokes did not arrive intact.'
exit 1
