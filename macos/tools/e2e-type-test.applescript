-- typed by the machine itself: the clean-install typing assertion
tell application "TextEdit"
	activate
	make new document
end tell
delay 3
tell application "System Events"
	keystroke "s"
	keystroke "H" using shift down
	keystroke "i"
	keystroke "H" using shift down
	keystroke "p"
end tell
delay 1
tell application "TextEdit" to get text of document 1
