@echo off
chcp 65001 > nul
title BioVector Studio

:: ── 현재 폴더 = 이 bat 파일 위치 ──────────────────────────
cd /d "%~dp0"

echo.
echo  BioVector Studio - 생명과학 AI SVG 변환기
echo  ================================================
echo.

:: ── Java 경로 감지 ─────────────────────────────────────────
:: 방법 1: PATH에서 직접 찾기
set "JAVAC_EXE="
for %%X in (javac.exe) do set "JAVAC_EXE=%%~$PATH:X"

:: 방법 2: 알려진 설치 경로 탐색
if not defined JAVAC_EXE (
    for /d %%d in (
        "%ProgramFiles%\Eclipse Adoptium\jdk-*"
        "%ProgramFiles%\Java\jdk-*"
        "%ProgramFiles%\Java\jdk*"
        "%ProgramFiles%\Microsoft\jdk-*"
        "%ProgramFiles%\OpenJDK\*"
        "%LOCALAPPDATA%\Programs\Eclipse Adoptium\jdk-*"
    ) do (
        if exist "%%d\bin\javac.exe" (
            if not defined JAVAC_EXE set "JAVAC_EXE=%%d\bin\javac.exe"
        )
    )
)

if not defined JAVAC_EXE (
    echo  [오류] Java JDK를 찾을 수 없습니다.
    echo.
    echo  설치: https://adoptium.net/
    echo.
    pause
    exit /b 1
)

:: javac.exe 경로에서 java.exe 경로 추출
for %%F in ("%JAVAC_EXE%") do set "JAVA_BIN=%%~dpF"
set "JAVA_EXE=%JAVA_BIN%java.exe"

echo  [OK] Java: %JAVAC_EXE%
echo.

:: ── output 폴더 생성 ──────────────────────────────────────
if not exist output mkdir output

:: ── 컴파일 ────────────────────────────────────────────────
echo  [1/2] 컴파일 중...
"%JAVAC_EXE%" BioVectorServer.java 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [오류] 컴파일 실패!
    pause
    exit /b 1
)
echo  [OK] 컴파일 완료
echo.

:: ── 서버 실행 ─────────────────────────────────────────────
echo  [2/2] 서버 시작 중...
echo.
echo  ================================================
echo    접속 주소: http://localhost:8090/
echo    종  료: 이 창을 닫거나 Ctrl+C
echo  ================================================
echo.

:: 2초 후 브라우저 자동 오픈
start "" /b cmd /c "timeout /t 2 /nobreak > nul && start http://localhost:8090/"

:: 서버 실행 (이 창이 살아있는 동안 서버 유지)
"%JAVA_EXE%" BioVectorServer 8090

echo.
echo  서버가 종료되었습니다.
pause
