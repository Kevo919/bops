# Stock installSection already creates links when keepShortcuts is false.
# Only refresh links it preserved on upgrade, including a win-unpacked target.
# Do not recreate links the user deleted. The stock desktop macro also respects
# --no-desktop-shortcut, and both macros retain the standard AppUserModelID.
!macro customInstall
  ${if} $keepShortcuts == "true"
    ${if} ${FileExists} "$newStartMenuLink"
      StrCpy $keepShortcuts "false"
      !insertmacro addStartMenuLink $keepShortcuts
      StrCpy $keepShortcuts "true"
    ${endif}
    ${if} ${FileExists} "$newDesktopLink"
      StrCpy $keepShortcuts "false"
      !insertmacro addDesktopLink $keepShortcuts
      StrCpy $keepShortcuts "true"
    ${endif}
  ${endif}
!macroend
