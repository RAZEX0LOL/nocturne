; При смене отображаемого имени продолжаем обновлять существующую установку.
; Идентификатор приложения и пользовательские данные остаются прежними.
Var NocturneLegacyDirectory

!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  StrCpy $NocturneLegacyDirectory ""
  ReadRegStr $0 HKCU "${MANUPRODUCTKEY}" ""
  ${If} $0 == ""
    ReadRegStr $1 HKCU "Software\Nocturne\Nocturne" ""
    ${If} $1 != ""
    ${AndIf} ${FileExists} "$1\${MAINBINARYNAME}.exe"
      StrCpy $NocturneLegacyDirectory $1
      StrCpy $INSTDIR $1
      SetOutPath $INSTDIR
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $0
  ${If} $NocturneLegacyDirectory != ""
  ${AndIf} $INSTDIR == $NocturneLegacyDirectory
  ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    ; Удаляем только регистрацию старого имени после записи нового установщика.
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Nocturne"
    DeleteRegKey HKCU "Software\Nocturne\Nocturne"
    !insertmacro IsShortcutTarget "$SMPROGRAMS\Nocturne.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 == 1
      Delete "$SMPROGRAMS\Nocturne.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\Nocturne.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 == 1
      Delete "$DESKTOP\Nocturne.lnk"
    ${EndIf}
  ${EndIf}
  Pop $0
!macroend
