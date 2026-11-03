# Refresh Bops' existing links even when NSIS keeps shortcuts during an upgrade.
# Reuse electron-builder's macros so the standard paths, AppUserModelID and
# explicit --no-desktop-shortcut choice remain respected. The same Bops.lnk is
# replaced, including the development shortcut pointing at win-unpacked.
!macro customInstall
  StrCpy $keepShortcuts "false"
  !insertmacro addDesktopLink $keepShortcuts
  !insertmacro addStartMenuLink $keepShortcuts
!macroend
