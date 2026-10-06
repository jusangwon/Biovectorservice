# 🔬 BioVector Studio

> **생명과학 연구실 전용 AI SVG 벡터 변환기**  
> 손그림, 실험 모식도, 생물학 다이어그램 이미지를 분석하여 분해 가능한 고품질 XML SVG 벡터 그래픽으로 자동 변환합니다.

---

## ✨ 주요 기능

- 🖼️ **연구 스케치 → 순수 SVG 변환**: 래스터 이미지(손그림/모식도)를 웹 표준 벡터 그래픽(SVG)으로 변환
- 🧬 **생명과학 맞춤형 렌더링**: DNA 나선, 세포 소기관, 실험 기구(비커/피펫/튜브), 단백질 구조 등 자동 인식
- 🧩 **개체별 분해 및 레이어 분리**: 생성된 SVG 요소를 개별 그룹화하여 파워포인트/일러스트레이터에서 편집 용이
- 💾 **로컬 자동 저장**: 날짜 및 주제별 폴더를 생성하여 원본 및 SVG 결과물 자동 보관
- ⚡ **무설치 로컬 서버**: Java 표준 라이브러리 기반 경량 HTTP 서버 내장 (외부 의존성 없음)

---

## 🚀 시작하기

### 사전 요구사항
- **Java SE (JDK 17 이상 권장)**: [Eclipse Adoptium](https://adoptium.net/) 등에서 설치

### 실행 방법
1. 저장소를 클론(또는 다운로드)합니다.
2. `apikey/key.example.txt`를 참고하여 `apikey/` 폴더 안에 `key.txt` 파일을 생성하고 본인의 Google Gemini API 키를 저장합니다.
3. `run.bat` 파일을 더블 클릭하여 실행합니다.
4. 브라우저에서 `http://localhost:8090/`으로 자동 접속됩니다.

---
### 추후 개선할것들(26.10.6)
1. 전체 모식도 인식성능 개선(전체 workflow 그리기 / 단일 백터 이미지 생성 분리)
2. 백터 스타일, 개체분리강도 부분 불필요한것 제거
3. 작업기록 클릭시 이전 내역 불러오기
4. 경로(path)클릭시 폴더 열기 or path 복사하기 

---

## 📁 프로젝트 구조

```text
portpol/
├── BioVectorServer.java      # 순수 Java 기반 경량 로컬 HTTP 서버
├── run.bat                   # 원클릭 컴파일 및 서버 실행 스크립트
├── index.html                # 스튜디오 웹 UI 메인 페이지
├── css/
│   └── bio-style.css         # 다크 테마 및 UI 스타일시트
├── js/
│   ├── app.js                # UI 상호작용 및 서버 연동 스크립트
│   └── vector-generator.js   # Gemini API 연동 및 프롬프트 제어
├── apikey/
│   └── key.example.txt       # API 키 설정 안내 파일 (key.txt는 gitignore 처리)
└── output/                   # 변환된 SVG 및 프로젝트 산출물 저장 디렉토리
```
