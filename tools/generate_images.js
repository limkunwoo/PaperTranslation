#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SD_HOST = '127.0.0.1';
const SD_PORT = 7860;
const OUTPUT_DIR = path.join(__dirname, '..', 'work', 'qna_images');

const IMAGES = [
  {
    name: 'sd_constraints',
    prompt:
      'technical illustration, two metal springs side by side comparison, left spring is rigid steel rod with fixed length, right spring has a rubber stopper on one end only, clean white background, engineering diagram style, labeled diagram, no text, high detail, professional illustration',
    negative_prompt:
      'blurry, low quality, text, watermark, signature, anime, cartoon',
    width: 768,
    height: 512,
    steps: 30,
    cfg_scale: 7.5,
    sampler_name: 'DPM++ 2M Karras',
  },
  {
    name: 'sd_cloth_buckling',
    prompt:
      'realistic cloth fabric being compressed from both sides, fabric forming natural wrinkles and buckles, white silk fabric on dark background, studio photography, soft lighting, macro shot, detailed fabric texture, physical simulation reference',
    negative_prompt:
      'blurry, low quality, text, watermark, signature, anime, cartoon, human',
    width: 768,
    height: 512,
    steps: 30,
    cfg_scale: 7.5,
    sampler_name: 'DPM++ 2M Karras',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Low-level HTTP JSON request using the built-in `http` module.
 * Returns a Promise that resolves with the parsed JSON body.
 */
function httpRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;

    const options = {
      hostname: SD_HOST,
      port: SD_PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload != null ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`JSON 파싱 실패 (HTTP ${res.statusCode}): ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('SD WebUI가 실행 중이지 않습니다 (연결 거부됨). http://127.0.0.1:7860 에서 서버를 먼저 시작해 주세요.'));
      } else {
        reject(err);
      }
    });

    if (payload != null) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * SD WebUI 연결 확인 — /sdapi/v1/sd-models 엔드포인트를 호출합니다.
 */
async function checkConnection() {
  console.log('[연결 확인] SD WebUI 서버에 연결 중...');
  try {
    const models = await httpRequest('GET', '/sdapi/v1/sd-models');
    if (!Array.isArray(models)) {
      throw new Error('예상치 못한 응답 형식입니다.');
    }
    console.log(`[연결 확인] 성공 — 사용 가능한 모델 ${models.length}개 감지됨`);
    if (models.length > 0) {
      console.log(`[연결 확인] 현재 첫 번째 모델: ${models[0].model_name || models[0].title}`);
    }
    return true;
  } catch (err) {
    console.error(`[연결 확인] 실패 — ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------

/**
 * 단일 이미지를 생성하고 PNG 파일로 저장합니다.
 */
async function generateImage(config) {
  const outputPath = path.join(OUTPUT_DIR, `${config.name}.png`);
  console.log(`\n[생성] "${config.name}" 이미지 생성 시작...`);
  console.log(`  프롬프트 : ${config.prompt.slice(0, 80)}...`);
  console.log(`  크기     : ${config.width}x${config.height}`);
  console.log(`  스텝     : ${config.steps}`);
  console.log(`  CFG 스케일: ${config.cfg_scale}`);
  console.log(`  샘플러   : ${config.sampler_name}`);

  const payload = {
    prompt: config.prompt,
    negative_prompt: config.negative_prompt,
    width: config.width,
    height: config.height,
    steps: config.steps,
    cfg_scale: config.cfg_scale,
    sampler_name: config.sampler_name,
    batch_size: 1,
    n_iter: 1,
    seed: -1,
  };

  const startTime = Date.now();
  const result = await httpRequest('POST', '/sdapi/v1/txt2img', payload);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!result.images || !Array.isArray(result.images) || result.images.length === 0) {
    throw new Error(`"${config.name}" — API 응답에 이미지가 포함되어 있지 않습니다.`);
  }

  // The first element is the generated image (base64-encoded PNG).
  // SD WebUI sometimes prepends metadata separated by a comma — handle both cases.
  let base64Data = result.images[0];
  if (base64Data.includes(',')) {
    base64Data = base64Data.split(',').pop();
  }

  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(outputPath, buffer);

  const sizeKB = (buffer.length / 1024).toFixed(1);
  console.log(`[생성] "${config.name}" 완료 — ${elapsed}초 소요, ${sizeKB} KB 저장됨`);
  console.log(`  저장 경로: ${outputPath}`);

  return outputPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  let targetName = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && i + 1 < args.length) {
      targetName = args[i + 1];
      i++;
    }
  }

  // Determine which images to generate
  let targets;
  if (targetName) {
    const found = IMAGES.find((img) => img.name === targetName);
    if (!found) {
      const available = IMAGES.map((img) => img.name).join(', ');
      console.error(`[오류] "${targetName}" 이라는 이름의 이미지 설정을 찾을 수 없습니다.`);
      console.error(`[오류] 사용 가능한 이름: ${available}`);
      process.exit(1);
    }
    targets = [found];
  } else {
    targets = IMAGES;
  }

  console.log('='.repeat(60));
  console.log('  Stable Diffusion 이미지 생성 스크립트');
  console.log('='.repeat(60));
  console.log(`  생성 대상: ${targets.map((t) => t.name).join(', ')}`);
  console.log(`  출력 디렉터리: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[준비] 출력 디렉터리 생성됨: ${OUTPUT_DIR}`);
  }

  // Check connection to SD WebUI
  const connected = await checkConnection();
  if (!connected) {
    process.exit(1);
  }

  // Generate images sequentially (OOM 방지)
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const config = targets[i];
    console.log(`\n[${ i + 1}/${targets.length}] 작업 시작...`);
    try {
      const outputPath = await generateImage(config);
      results.push({ name: config.name, success: true, path: outputPath });
    } catch (err) {
      console.error(`[오류] "${config.name}" 생성 실패 — ${err.message}`);
      results.push({ name: config.name, success: false, error: err.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  결과 요약');
  console.log('='.repeat(60));
  for (const r of results) {
    const status = r.success ? '성공' : '실패';
    const detail = r.success ? r.path : r.error;
    console.log(`  [${status}] ${r.name} — ${detail}`);
  }
  console.log('='.repeat(60));

  const failCount = results.filter((r) => !r.success).length;
  if (failCount > 0) {
    console.log(`\n${failCount}개의 이미지 생성에 실패했습니다.`);
    process.exit(1);
  } else {
    console.log(`\n모든 이미지(${results.length}개)가 성공적으로 생성되었습니다.`);
  }
}

main();
