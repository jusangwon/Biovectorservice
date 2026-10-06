/**
 * BioVector Studio - app.js
 * UI 컨트롤러: 이벤트 핸들링, 드래그&드롭, 결과 렌더링, 저장 연동
 */

// ──────────────────────────────────────────────────────────
// 앱 상태 (State)
// ──────────────────────────────────────────────────────────
const App = {
  apiKey:       '',
  currentFile:  null,
  currentEntities: [],
  selectedEntityIdx: -1,
  intensityMode: 'moderate', // single / moderate / full
  enhanceOn:    true,
  isGenerating: false,
  savedFolderPath: '',
};

// ──────────────────────────────────────────────────────────
// DOM 요소 참조
// ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
  dropzone:       () => $('dropzone'),
  fileInput:      () => $('fileInput'),
  previewWrap:    () => $('previewWrap'),
  previewImg:     () => $('previewImg'),
  previewClose:   () => $('previewClose'),
  enhanceToggle:  () => $('enhanceToggle'),
  keywordInput:   () => $('keywordInput'),
  charCount:      () => $('charCount'),
  journalSelect:  () => $('journalSelect'),
  colorSelect:    () => $('colorSelect'),
  btnGenerate:    () => $('btnGenerate'),
  btnIcon:        () => $('btnIcon'),
  btnSpinner:     () => $('btnSpinner'),
  btnText:        () => $('btnText'),
  progressPanel:  () => $('progressPanel'),
  progressFill:   () => $('progressFill'),
  progressLabel:  () => $('progressLabel'),
  step1:          () => $('step1'),
  step2:          () => $('step2'),
  step3:          () => $('step3'),
  step4:          () => $('step4'),
  resultPanel:    () => $('resultPanel'),
  emptyState:     () => $('emptyState'),
  galleryGrid:    () => $('galleryGrid'),
  entityCount:    () => $('entityCount'),
  savedPath:      () => $('savedPath'),
  btnOpenFolder:  () => $('btnOpenFolder'),
  btnZipAll:      () => $('btnZipAll'),
  codeViewer:     () => $('codeViewer'),
  codeViewerTitle:() => $('codeViewerTitle'),
  codeContent:    () => $('codeContent'),
  btnCopyCode:    () => $('btnCopyCode'),
  modalOverlay:   () => $('modalOverlay'),
  modalTitle:     () => $('modalTitle'),
  modalSvgView:   () => $('modalSvgView'),
  modalClose:     () => $('modalClose'),
  toastContainer: () => $('toastContainer'),
  historyList:    () => $('historyList'),
};

// ──────────────────────────────────────────────────────────
// 초기화
// ──────────────────────────────────────────────────────────
async function init() {
  await loadApiKey();
  bindEvents();
  loadHistory();
  // 기본 강도 모드 설정
  setIntensity('moderate');
}

// ──────────────────────────────────────────────────────────
// API 키 로드
// ──────────────────────────────────────────────────────────
async function loadApiKey() {
  try {
    const res  = await fetch('/api/key');
    const data = await res.json();
    if (data.found && data.key) {
      App.apiKey = data.key;
      const statusEl = $('apiStatus');
      if (statusEl) {
        statusEl.innerHTML = '<span class="api-status-dot"></span>API Key 연결됨';
        statusEl.style.display = 'flex';
      }
    } else {
      showToast('⚠️ API 키를 찾을 수 없습니다. portpol/apikey/key.txt 파일을 확인해 주세요.', 'error');
    }
  } catch (e) {
    // 서버 없이 직접 파일로 열었을 때
    console.warn('서버 API 키 로드 실패 (직접 파일 열기 모드):', e.message);
  }
}

// ──────────────────────────────────────────────────────────
// 이벤트 바인딩
// ──────────────────────────────────────────────────────────
function bindEvents() {
  // 드롭존
  const dz = DOM.dropzone();
  dz.addEventListener('click',      () => DOM.fileInput().click());
  dz.addEventListener('dragover',   e  => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave',  ()  => dz.classList.remove('drag-over'));
  dz.addEventListener('drop',       e  => { e.preventDefault(); dz.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
  DOM.fileInput().addEventListener('change', e => handleFile(e.target.files[0]));

  // 미리보기 닫기
  DOM.previewClose().addEventListener('click', clearPreview);

  // 선명도 보정 토글
  DOM.enhanceToggle().addEventListener('change', e => { App.enhanceOn = e.target.checked; });

  // 키워드 글자 수
  DOM.keywordInput().addEventListener('input', e => {
    DOM.charCount().textContent = `${e.target.value.length} / 500`;
  });

  // 생성 버튼
  DOM.btnGenerate().addEventListener('click', onGenerate);

  // 코드 뷰어 복사
  DOM.btnCopyCode().addEventListener('click', copyCodeToClipboard);

  // 모달 닫기
  DOM.modalClose().addEventListener('click', closeModal);
  DOM.modalOverlay().addEventListener('click', e => { if (e.target === DOM.modalOverlay()) closeModal(); });

  // Escape 키 모달 닫기
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // output 폴더 열기 버튼 (서버 경유)
  DOM.btnOpenFolder().addEventListener('click', () => {
    if (App.savedFolderPath) {
      showToast(`📁 폴더 경로: ${App.savedFolderPath}`, 'info');
    }
  });

  // ZIP 다운로드 (브라우저 내 다운로드)
  DOM.btnZipAll().addEventListener('click', downloadAll);
}

// ──────────────────────────────────────────────────────────
// 파일 처리
// ──────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('❌ 이미지 파일만 업로드 가능합니다 (JPG, PNG, WEBP, GIF)', 'error');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('❌ 파일 크기는 20MB 이하여야 합니다.', 'error');
    return;
  }
  App.currentFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    DOM.previewImg().src = e.target.result;
    DOM.previewWrap().classList.add('active');
    DOM.dropzone().style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearPreview() {
  App.currentFile = null;
  DOM.previewImg().src = '';
  DOM.previewWrap().classList.remove('active');
  DOM.dropzone().style.display = '';
  DOM.fileInput().value = '';
}

// ──────────────────────────────────────────────────────────
// 강도 모드 설정
// ──────────────────────────────────────────────────────────
function setIntensity(mode) {
  App.intensityMode = mode;
  document.querySelectorAll('.intensity-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

// ──────────────────────────────────────────────────────────
// 메인: SVG 벡터 생성
// ──────────────────────────────────────────────────────────
async function onGenerate() {
  if (App.isGenerating) return;

  const keyword = DOM.keywordInput().value.trim();
  if (!keyword) {
    showToast('📝 생명과학 키워드 또는 설명을 입력해 주세요.', 'error');
    DOM.keywordInput().focus();
    return;
  }
  if (!App.currentFile) {
    showToast('🖼️ 손그림 또는 이미지를 먼저 업로드해 주세요.', 'error');
    return;
  }
  if (!App.apiKey) {
    showToast('🔑 Gemini API 키를 portpol/apikey/key.txt에 저장해 주세요.', 'error');
    return;
  }

  App.isGenerating = true;
  setGeneratingUI(true);
  showProgress(true);
  setProgressStep(1, 'active');

  try {
    // [1단계] 이미지 전처리
    updateProgressLabel('🔬 이미지 선명화 처리 중...', 10);
    const { base64, mimeType } = await VectorGenerator.imageFileToBase64(
      App.currentFile, App.enhanceOn
    );
    setProgressStep(1, 'done');

    // [2단계] AI 개체 분석
    setProgressStep(2, 'active');
    updateProgressLabel('🧬 생명과학 개체 식별 및 분석 중...', 30);

    const journalStyle = DOM.journalSelect().value;
    const colorTone    = DOM.colorSelect().value;

    const entities = await VectorGenerator.generate({
      imageBase64:  base64,
      imageMimeType: mimeType,
      keyword,
      journalStyle,
      colorTone,
      intensity: App.intensityMode,
      apiKey: App.apiKey,
    });
    setProgressStep(2, 'done');

    // [3단계] SVG 합성
    setProgressStep(3, 'active');
    updateProgressLabel('✏️ 순수 XML SVG 코드 합성 중...', 65);
    App.currentEntities = entities;
    await sleep(400); // 시각적 피드백
    setProgressStep(3, 'done');

    // [4단계] 로컬 폴더 저장
    setProgressStep(4, 'active');
    updateProgressLabel('💾 날짜별 폴더에 SVG 파일 저장 중...', 85);
    const saveResult = await saveToServer(entities, keyword);
    setProgressStep(4, 'done');
    updateProgressLabel('✅ 완료!', 100);

    // 결과 렌더링
    await sleep(300);
    renderGallery(entities, saveResult);
    saveHistory(keyword, entities.length);
    loadHistory();

    showToast(`🎉 ${entities.length}개 벡터 개체 생성 완료! 폴더에 저장되었습니다.`, 'success');

  } catch (err) {
    console.error('[BioVector] 오류:', err);
    showToast(`❌ 오류: ${err.message}`, 'error');
    showProgress(false);
  } finally {
    App.isGenerating = false;
    setGeneratingUI(false);
  }
}

// ──────────────────────────────────────────────────────────
// 서버에 SVG 저장 요청
// ──────────────────────────────────────────────────────────
async function saveToServer(entities, keyword) {
  try {
    const payload = {
      keyword,
      svgs: entities.map(e => ({
        name:        e.name,
        description: e.description,
        category:    e.category,
        svg:         e.svg,
      })),
    };

    const res = await fetch('/api/save-vectors', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);
    const data = await res.json();
    if (data.success) {
      App.savedFolderPath = data.folder;
      return data;
    }
    throw new Error(data.error || '저장 실패');
  } catch (e) {
    // 서버 없이 브라우저 직접 실행 시 → 자동 다운로드로 대체
    console.warn('서버 저장 실패, 브라우저 다운로드로 대체:', e.message);
    App.savedFolderPath = '로컬 다운로드 (서버 미연결)';
    return { folderName: `${getTimestamp()}_${keyword.substring(0,20)}`, count: entities.length };
  }
}

// ──────────────────────────────────────────────────────────
// 갤러리 렌더링
// ──────────────────────────────────────────────────────────
function renderGallery(entities, saveResult) {
  const grid = DOM.galleryGrid();
  grid.innerHTML = '';

  // 빈 상태 숨기기
  const emptyEl = DOM.emptyState();
  if (emptyEl) emptyEl.style.display = 'none';

  DOM.entityCount().textContent = `${entities.length}개`;

  if (saveResult && saveResult.folderName) {
    DOM.savedPath().textContent = saveResult.folderName;
    DOM.savedPath().title       = App.savedFolderPath;
  }

  const catColors = {
    cell: 'cat-cell', molecule: 'cat-molecule', labware: 'cat-labware',
    pathway: 'cat-pathway', gene: 'cat-gene', protein: 'cat-protein', other: 'cat-other',
  };

  entities.forEach((entity, idx) => {
    const card = document.createElement('div');
    // Bug Fix: 카테고리 클래스를 card 자체에 부여해야 CSS 선택자가 동작
    const catClass = catColors[entity.category] || 'cat-other';
    card.className = `entity-card ${catClass}`;
    card.id        = `entity-card-${idx}`;

    const isFullDiagram = entity.isFullDiagram;
    const cardNum = isFullDiagram ? '00' : String(idx + 1).padStart(2, '0');
    const catLabel = getCategoryLabel(entity.category);

    card.innerHTML = `
      <div class="card-svg-preview" id="svgPreview-${idx}">
        ${entity.svg}
        <button class="card-bg-toggle" onclick="toggleCardBg(${idx})" title="배경 전환">◑</button>
      </div>
      <div class="card-info">
        <span class="card-category">${cardNum} · ${catLabel}${isFullDiagram ? ' · 통합본' : ''}</span>
        <div class="card-name">${escapeHtml(entity.nameKr || entity.name)}</div>
        <div class="card-desc">${escapeHtml(entity.description)}</div>
      </div>
      <div class="card-actions">
        <button class="card-btn" onclick="showCodeViewer(${idx})" id="viewXml-${idx}">XML</button>
        <button class="card-btn" onclick="openSvgModal(${idx})" id="zoom-${idx}">확대</button>
        <button class="card-btn card-btn-download" onclick="downloadSingleSVG(${idx})" id="dlSvg-${idx}">↓ 저장</button>
      </div>
    `;

    grid.appendChild(card);
    card.style.animationDelay = `${idx * 0.06}s`;
  });

  // 코드 뷰어 첫 번째 개체로 초기화
  if (entities.length > 0) showCodeViewer(0);
}

// ──────────────────────────────────────────────────────────
// XML 코드 뷰어 표시
// ──────────────────────────────────────────────────────────
function showCodeViewer(idx) {
  const entity = App.currentEntities[idx];
  if (!entity) return;
  App.selectedEntityIdx = idx;

  DOM.codeViewer().classList.add('active');
  DOM.codeViewerTitle().textContent = `${entity.nameKr || entity.name}.svg — XML 코드`;

  // 구문 강조 적용
  DOM.codeContent().innerHTML = VectorGenerator.highlightSVGXML(entity.svg);

  // 복사 버튼 리셋
  DOM.btnCopyCode().textContent = '📋 복사';
  DOM.btnCopyCode().classList.remove('copied');

  // 스크롤
  DOM.codeContent().scrollTop = 0;
}

// ──────────────────────────────────────────────────────────
// XML 코드 클립보드 복사
// ──────────────────────────────────────────────────────────
function copyCodeToClipboard() {
  const entity = App.currentEntities[App.selectedEntityIdx];
  if (!entity) return;
  navigator.clipboard.writeText(entity.svg).then(() => {
    DOM.btnCopyCode().textContent = '✅ 복사됨!';
    DOM.btnCopyCode().classList.add('copied');
    setTimeout(() => {
      DOM.btnCopyCode().textContent = '📋 복사';
      DOM.btnCopyCode().classList.remove('copied');
    }, 2000);
  });
}

// ──────────────────────────────────────────────────────────
// SVG 확대 모달
// ──────────────────────────────────────────────────────────
function openSvgModal(idx) {
  const entity = App.currentEntities[idx];
  if (!entity) return;
  DOM.modalTitle().textContent = entity.nameKr || entity.name;
  DOM.modalSvgView().innerHTML = entity.svg;

  // 모달 내 SVG 크기 조정
  const svg = DOM.modalSvgView().querySelector('svg');
  if (svg) {
    svg.style.maxWidth  = '100%';
    svg.style.maxHeight = '500px';
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }

  DOM.modalOverlay().classList.add('active');
}

function closeModal() {
  DOM.modalOverlay().classList.remove('active');
}

// ──────────────────────────────────────────────────────────
// 개별 SVG 다운로드
// ──────────────────────────────────────────────────────────
function downloadSingleSVG(idx) {
  const entity = App.currentEntities[idx];
  if (!entity) return;
  const filename = `${String(idx + 1).padStart(2,'0')}_${entity.name}.svg`;
  VectorGenerator.downloadSVG(entity.svg, filename);
  showToast(`💾 ${filename} 다운로드 시작`, 'success');
}

// ──────────────────────────────────────────────────────────
// 전체 SVG 개별 다운로드 (ZIP 대체)
// ──────────────────────────────────────────────────────────
async function downloadAll() {
  if (App.currentEntities.length === 0) {
    showToast('다운로드할 SVG 파일이 없습니다.', 'error');
    return;
  }
  App.currentEntities.forEach((entity, idx) => {
    setTimeout(() => {
      const filename = `${String(idx + 1).padStart(2,'0')}_${entity.name}.svg`;
      VectorGenerator.downloadSVG(entity.svg, filename);
    }, idx * 150);
  });
  showToast(`📦 ${App.currentEntities.length}개 파일 개별 다운로드 중...`, 'info');
}

// ──────────────────────────────────────────────────────────
// 카드 배경 토글 (흰색 ↔ 검정)
// ──────────────────────────────────────────────────────────
function toggleCardBg(idx) {
  // Bug Fix: $ 함수는 getElementById와 동일, ID 직접 사용해야 함
  const card = document.getElementById(`entity-card-${idx}`);
  if (card) card.classList.toggle('card-bg-dark');
}

// ──────────────────────────────────────────────────────────
// 진행 상태 UI 제어
// ──────────────────────────────────────────────────────────
function showProgress(visible) {
  DOM.progressPanel().classList.toggle('active', visible);
  if (!visible) {
    // 스텝 초기화
    ['step1','step2','step3','step4'].forEach(id => {
      const el = $(id);
      if (el) { el.className = 'progress-step'; }
    });
    DOM.progressFill().style.width = '0%';
  }
}

function setProgressStep(step, state) {
  const el = $(`step${step}`);
  if (!el) return;
  el.className = `progress-step ${state}`;
  const icon = el.querySelector('.step-icon');
  if (icon) {
    icon.textContent = state === 'done' ? '✓' : state === 'active' ? '◌' : '';
  }
}

function updateProgressLabel(text, percent) {
  DOM.progressLabel().textContent = text;
  DOM.progressFill().style.width  = `${percent}%`;
}

function setGeneratingUI(loading) {
  const btn = DOM.btnGenerate();
  btn.disabled = loading;
  // 스피너는 CSS class로 제어 (style.display 충돌 방지)
  const spinner = DOM.btnSpinner();
  const icon    = DOM.btnIcon();
  if (loading) {
    spinner.classList.add('visible');
    icon.style.visibility = 'hidden';
    icon.style.position   = 'absolute';
  } else {
    spinner.classList.remove('visible');
    icon.style.visibility = '';
    icon.style.position   = '';
  }
  DOM.btnText().textContent = loading ? '분석 중...' : '개체별 SVG 벡터 제작하기';
}

// ──────────────────────────────────────────────────────────
// 히스토리 저장/불러오기 (LocalStorage)
// ──────────────────────────────────────────────────────────
function saveHistory(keyword, count) {
  const hist = JSON.parse(localStorage.getItem('biovector_history') || '[]');
  hist.unshift({ keyword, count, time: new Date().toLocaleString('ko-KR') });
  localStorage.setItem('biovector_history', JSON.stringify(hist.slice(0, 8)));
}

function loadHistory() {
  const hist = JSON.parse(localStorage.getItem('biovector_history') || '[]');
  const list = DOM.historyList();
  if (!list) return;
  if (hist.length === 0) {
    list.innerHTML = '<div style="font-size:0.73rem;color:var(--text-muted);padding:6px 12px;">작업 기록 없음</div>';
    return;
  }
  list.innerHTML = hist.map((h, i) =>
    `<div class="history-item" id="hist-${i}" onclick="loadHistoryItem(${i})" title="${h.time}">
      [${h.count}개] ${h.keyword.substring(0,40)}${h.keyword.length > 40 ? '…' : ''}
    </div>`
  ).join('');
}

function loadHistoryItem(idx) {
  const hist = JSON.parse(localStorage.getItem('biovector_history') || '[]');
  const item = hist[idx];
  if (!item) return;
  DOM.keywordInput().value = item.keyword;
  DOM.charCount().textContent = `${item.keyword.length} / 500`;
}

// ──────────────────────────────────────────────────────────
// 토스트 알림
// ──────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = DOM.toastContainer();
  const toast     = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), type === 'error' ? 5000 : 3500);
}

// ──────────────────────────────────────────────────────────
// 카테고리 한국어 라벨
// ──────────────────────────────────────────────────────────
function getCategoryLabel(cat) {
  const map = {
    cell:     'CELL / ORGANELLE',
    molecule: 'BIOMOLECULE',
    labware:  'LABWARE',
    pathway:  'SIGNALING',
    gene:     'GENE / DNA',
    protein:  'PROTEIN / ENZYME',
    other:    'OTHER',
  };
  return map[cat] || cat.toUpperCase();
}

// Bug Fix: XSS 방지용 HTML 이스케이프
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ──────────────────────────────────────────────────────────
// 유틸리티
// ──────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}
function p2(n) { return String(n).padStart(2,'0'); }

// ──────────────────────────────────────────────────────────
// DOM 준비 후 초기화
// ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
