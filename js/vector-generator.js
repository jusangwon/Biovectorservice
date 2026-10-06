/**
 * BioVector Studio - vector-generator.js
 * 생명과학 개체별 순수 XML SVG 생성 엔진
 * Gemini Multimodal Vision API 연동 + SVG 코드 파싱/검증
 * AQ. 신규 키 형식 및 AIza 기존 키 형식 모두 지원
 */

const VectorGenerator = (() => {
  // ──────────────────────────────────────────────────────
  // Gemini 모델 우선순위 (폴백 전략)
  // ──────────────────────────────────────────────────────
  // AQ. 키 전용 최신 모델 목록 (v1alpha)
  // 모든 후보를 나열해 503/404 시 자동 폴백
  const MODELS_AQ = [
    { model: 'gemini-3.8-flash',     base: 'v1alpha' },
    { model: 'gemini-3.5-flash',     base: 'v1alpha' },
    { model: 'gemini-2.5-flash',     base: 'v1alpha' },
    { model: 'gemini-2.5-flash',     base: 'v1beta'  },
    { model: 'gemini-2.0-flash-exp', base: 'v1beta'  },
  ];
  // AIza 기존 키 모델 목록 (v1beta)
  const MODELS_LEGACY = [
    { model: 'gemini-2.5-flash',     base: 'v1beta'  },
    { model: 'gemini-1.5-pro',       base: 'v1beta'  },
    { model: 'gemini-1.5-flash',     base: 'v1beta'  },
    { model: 'gemini-2.0-flash-exp', base: 'v1beta'  },
  ];

  const API_BASE_V1BETA = 'https://generativelanguage.googleapis.com/v1beta/models';
  const API_BASE_V1ALPHA = 'https://generativelanguage.googleapis.com/v1alpha/models';

  // ──────────────────────────────────────────────────────
  // 생명과학 카테고리 컬러 팔레트 (학술 저널 규격)
  // ──────────────────────────────────────────────────────
  const BIO_PALETTES = {
    'Nature': {
      cell:      ['#4ecdc4','#45b7d1','#96ceb4'],
      molecule:  ['#ff6b6b','#feca57','#ff9ff3'],
      labware:   ['#a8e6cf','#dcedc1','#ffd3b6'],
      pathway:   ['#667eea','#764ba2','#f093fb'],
      gene:      ['#11998e','#38ef7d'],
      protein:   ['#ee0979','#ff6a00'],
    },
    'Cell': {
      cell:      ['#2193b0','#6dd5ed'],
      molecule:  ['#f7971e','#ffd200'],
      labware:   ['#56ab2f','#a8e063'],
      pathway:   ['#8360c3','#2ebf91'],
      gene:      ['#c94b4b','#4b134f'],
      protein:   ['#1a1a2e','#16213e'],
    },
    '파스텔 바이오': {
      cell:      ['#b5ead7','#c7ceea'],
      molecule:  ['#ffdac1','#ffb7b2'],
      labware:   ['#e2f0cb','#b5ead7'],
      pathway:   ['#c9b1ff','#fdffb6'],
      gene:      ['#ff9aa2','#ffb7b2'],
      protein:   ['#a0c4ff','#caffbf'],
    },
    'BioRender': {
      cell:      ['#00adb5','#393e46'],
      molecule:  ['#e94560','#0f3460'],
      labware:   ['#1a1a2e','#533483'],
      pathway:   ['#f5a623','#f8e71c'],
      gene:      ['#7ed321','#417505'],
      protein:   ['#bd10e0','#9013fe'],
    },
  };

  // ──────────────────────────────────────────────────────
  // 메인: 이미지 + 키워드 → 개체별 SVG 배열 생성
  // ──────────────────────────────────────────────────────
  async function generate({ imageBase64, imageMimeType, keyword, journalStyle, colorTone, intensity, apiKey }) {
    const palette = BIO_PALETTES[colorTone] || BIO_PALETTES['파스텔 바이오'];
    const maxEntities = intensity === 'single' ? 3 : intensity === 'moderate' ? 5 : 8;

    const systemPrompt = buildSystemPrompt(keyword, journalStyle, palette, maxEntities);

    // 키 형식에 따라 모델 목록 선택 (AQ. → 최신, AIza → 레거시)
    const models = apiKey && apiKey.startsWith('AQ.') ? MODELS_AQ : MODELS_LEGACY;

    // 모델 폴백 전략 (각 항목은 { model, base } 객체)
    let lastErr;
    for (const entry of models) {
      try {
        console.log(`[VectorGen] 시도: ${entry.base}/${entry.model}`);
        const result = await callGeminiVision({ model: entry.model, base: entry.base, apiKey, imageBase64, imageMimeType, systemPrompt });
        console.log(`[VectorGen] 성공: ${entry.model}`);
        return result;
      } catch (err) {
        lastErr = err;
        console.warn(`[VectorGen] ${entry.model} (${entry.base}) 실패:`, err.message);
      }
    }
    throw new Error(`모든 모델 호출 실패. 마지막 오류: ${lastErr?.message || '알 수 없음'}`);
  }

  // ──────────────────────────────────────────────────────
  // 생명과학 특화 시스템 프롬프트 빌더
  // ──────────────────────────────────────────────────────
  function buildSystemPrompt(keyword, journalStyle, palette, maxEntities) {
    const paletteStr = JSON.stringify(palette, null, 2);

    return `You are an expert biomedical scientific illustrator specializing in creating publication-quality SVG vector graphics for life science research (Cell, Nature, Science journal standards).

## TASK
Analyze the provided image (hand-drawn sketch, photograph, or diagram from a biology/biochemistry laboratory) along with the researcher's keyword description. Identify all distinct biological entities/objects in the image and create individual, pure XML SVG vector graphics for each entity.

## KEYWORD CONTEXT
${keyword}

## JOURNAL STYLE: ${journalStyle}

## COLOR PALETTE (use these colors):
${paletteStr}

## OUTPUT FORMAT (CRITICAL - must be valid JSON)
Return ONLY a valid JSON object in this exact structure:
{
  "entities": [
    {
      "name": "Entity_Name_English",
      "nameKr": "개체명 한국어",
      "category": "cell|molecule|labware|pathway|gene|protein|other",
      "description": "Brief scientific description in Korean (1-2 sentences)",
      "svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 400' width='500' height='400'><!-- pure XML SVG code here, NO external references, NO base64 images --></svg>"
    }
  ],
  "fullDiagram": {
    "name": "Full_Mechanism_Diagram",
    "nameKr": "전체 메커니즘 다이어그램",
    "category": "other",
    "description": "모든 개체가 통합된 전체 메커니즘 다이어그램",
    "svg": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 600' width='900' height='600'><!-- combined diagram --></svg>"
  }
}

## SVG REQUIREMENTS (MANDATORY):
1. Pure XML SVG only - NO base64 images, NO external fonts, NO raster graphics
2. Use ONLY these SVG elements: svg, g, path, circle, ellipse, rect, polygon, polyline, line, text, defs, linearGradient, radialGradient, stop, filter, feGaussianBlur, feMerge, feMergeNode, title, desc
3. viewBox must be set correctly, e.g. viewBox="0 0 500 400"
4. Include meaningful IDs: id="nucleus", id="cell-membrane", etc.
5. Use semantic grouping with <g id="..." label="...">
6. Add <title> and <desc> elements for accessibility
7. Gradients and filters must be defined in <defs>
8. Stroke/fill colors from the palette above
9. Scientific accuracy - draw biologically correct shapes
10. Maximum ${maxEntities} entities (most important/distinct ones)
11. Labels in Korean inside SVG using <text> elements
12. The SVG must render completely standalone in a browser

## BIOLOGICAL ENTITY EXAMPLES:
- Cell membrane: lipid bilayer with phospholipid heads/tails
- Nucleus: double membrane with nuclear pores
- Plasmid: circular DNA with restriction sites labeled
- Protein/Enzyme: schematic ribbon diagram style
- DNA double helix: stylized ladder with base pairs
- Ribosome: large/small subunit cartoon
- Mitochondria: outer/inner membrane, cristae
- Laboratory equipment: stylized clean vector art

Respond ONLY with the JSON. No markdown code blocks, no explanation text outside the JSON.`;
  }

  // ──────────────────────────────────────────────────────
  // API 키 형식에 따라 엔드포인트 결정
  // AQ. 형식 → v1alpha 사용, AIza 형식 → v1beta 사용
  // ──────────────────────────────────────────────────────
  function getApiBase(version) {
    if (version === 'v1alpha') return API_BASE_V1ALPHA;
    return API_BASE_V1BETA;
  }

  // ──────────────────────────────────────────────────────
  // Gemini Vision API 호출
  // ──────────────────────────────────────────────────────
  async function callGeminiVision({ model, base, apiKey, imageBase64, imageMimeType, systemPrompt }) {
    const apiBase = getApiBase(base);
    const url = `${apiBase}/${model}:generateContent?key=${apiKey}`;

    const parts = [
      { text: systemPrompt },
    ];

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType || 'image/jpeg',
          data: imageBase64,
        }
      });
    }

    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.3,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 65536,
        // Bug Fix: responseMimeType='application/json'은 v1alpha(AQ. 키)에서
        // 지원 안될 수 있어 제거. 프론트에서 JSON 직접 파싱 처리.
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API 오류 (${res.status}): ${errText.substring(0, 200)}`);
    }

    const data = await res.json();

    // 응답에서 텍스트 추출
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!raw) throw new Error('Gemini 응답이 비어있습니다.');

    return parseGeminiResponse(raw);
  }

  // ──────────────────────────────────────────────────────
  // Gemini 응답 파싱 (JSON 추출 및 SVG 검증)
  // ──────────────────────────────────────────────────────
  function parseGeminiResponse(raw) {
    let json = raw.trim();

    // ```json ... ``` 마크다운 블록 제거
    if (json.startsWith('```')) {
      json = json.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      // JSON 파싱 실패 시 첫 번째 { } 블록 추출 시도
      const start = json.indexOf('{');
      const end   = json.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(json.substring(start, end + 1));
        } catch {
          throw new Error('Gemini 응답을 JSON으로 파싱할 수 없습니다. 다시 시도해 주세요.');
        }
      } else {
        throw new Error('응답에서 JSON을 찾을 수 없습니다. 다시 시도해 주세요.');
      }
    }

    // entities 정규화
    const entities = (parsed.entities || []).map(e => sanitizeEntity(e));

    // fullDiagram이 있으면 마지막에 추가
    if (parsed.fullDiagram) {
      const fd = sanitizeEntity(parsed.fullDiagram);
      fd.isFullDiagram = true;
      entities.push(fd);
    }

    if (entities.length === 0) {
      throw new Error('분석된 개체가 없습니다. 이미지를 다시 확인하거나 키워드를 더 구체적으로 입력해 주세요.');
    }

    return entities;
  }

  // ──────────────────────────────────────────────────────
  // SVG 코드 위생 처리 및 검증
  // ──────────────────────────────────────────────────────
  function sanitizeEntity(e) {
    let svg = (e.svg || '').trim();

    // SVG 태그가 없으면 플레이스홀더 생성
    if (!svg.includes('<svg') || !svg.includes('</svg>')) {
      svg = generatePlaceholderSVG(e.name || 'Unknown', e.category || 'other');
    }

    // 외부 리소스 참조 제거 (보안)
    svg = svg
      .replace(/xlink:href="http[^"]*"/g, '')
      .replace(/href="http[^"]*"/g, '')
      .replace(/<image[^>]*>/gi, '');

    // xmlns 보장
    if (!svg.includes('xmlns=')) {
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    return {
      name:        e.name || 'Unknown_Entity',
      nameKr:      e.nameKr || e.name || '알 수 없음',
      category:    e.category || 'other',
      description: e.description || '',
      svg:         svg,
      isFullDiagram: e.isFullDiagram || false,
    };
  }

  // ──────────────────────────────────────────────────────
  // 플레이스홀더 SVG 생성 (파싱 실패 시)
  // ──────────────────────────────────────────────────────
  function generatePlaceholderSVG(name, category) {
    const colors = {
      cell: '#22c55e', molecule: '#eab308', labware: '#3b82f6',
      pathway: '#a855f7', gene: '#ef4444', protein: '#f97316', other: '#666'
    };
    const c  = colors[category] || '#666';
    // Bug Fix: Date.now()를 한 번만 호출해 일관성 보장
    const uid = `ph-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">
  <rect width="300" height="200" rx="8" fill="#1a1a1a" stroke="${c}" stroke-width="1" stroke-opacity="0.4"/>
  <rect x="10" y="10" width="280" height="180" rx="6" fill="none" stroke="${c}" stroke-width="0.5" stroke-opacity="0.2" stroke-dasharray="4 4"/>
  <circle cx="150" cy="85" r="24" fill="none" stroke="${c}" stroke-width="1.5"/>
  <text x="150" y="90" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="${c}">⚗</text>
  <text x="150" y="128" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="${c}" font-weight="600">${name}</text>
  <text x="150" y="150" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="${c}" opacity="0.5">재시도 권장</text>
</svg>`;
  }

  // ──────────────────────────────────────────────────────
  // SVG → Blob URL (다운로드용)
  // ──────────────────────────────────────────────────────
  function svgToBlob(svgString) {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    return URL.createObjectURL(blob);
  }

  function downloadSVG(svgString, filename) {
    const url = svgToBlob(svgString);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename.endsWith('.svg') ? filename : filename + '.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ──────────────────────────────────────────────────────
  // 이미지 → Base64 변환 + 선명도 보정
  // ──────────────────────────────────────────────────────
  function imageFileToBase64(file, enhance = true) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if (!enhance) {
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mimeType: file.type });
          return;
        }
        // 선명도 보정 (캔버스 필터)
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width  = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          // 밝기·대비 향상 (손그림 선명화)
          ctx.filter = 'contrast(1.4) brightness(1.1) saturate(0.8)';
          ctx.drawImage(img, 0, 0);

          const enhanced = canvas.toDataURL(file.type || 'image/jpeg', 0.95);
          const base64   = enhanced.split(',')[1];
          resolve({ base64, mimeType: file.type || 'image/jpeg' });
        };
        img.onerror = reject;
        img.src = dataUrl;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ──────────────────────────────────────────────────────
  // XML SVG 구문 강조 (코드 뷰어용)
  // ──────────────────────────────────────────────────────
  function highlightSVGXML(svgStr) {
    return svgStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(&lt;\/?[\w:]+)/g, '<span class="tag">$1</span>')
      .replace(/([\w:]+)=/g, '<span class="attr">$1</span>=')
      .replace(/&gt;/g, '<span class="tag">&gt;</span>')
      .replace(/"([^"]*)"/g, '"<span class="value">$1</span>"')
      .replace(/(&lt;!--.*?--&gt;)/g, '<span class="comment">$1</span>');
  }

  // Public API
  return {
    generate,
    downloadSVG,
    imageFileToBase64,
    highlightSVGXML,
    svgToBlob,
  };
})();
