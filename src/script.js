// -------------------------------------------------------------
// Step 0: 스타일시트 임포트 (Vite 환경)
// -------------------------------------------------------------
import './input.css';

// -------------------------------------------------------------
// Step 1: 모듈 임포트
// -------------------------------------------------------------
import * as faceapi from '@vladmandic/face-api';
import ColorThief from 'colorthief';
import { converter, differenceCiede2000 } from 'culori';
import html2canvas from 'html2canvas';

// -------------------------------------------------------------
// Step 2: 전역 변수 및 상수 선언
// -------------------------------------------------------------
const MODEL_URL = '/models';
const DATA_URL = '/data';
let palettesData = null;
let centroidsData = null;
let isModelLoaded = false;

// -------------------------------------------------------------
// Step 3: DOM 요소 가져오기
// -------------------------------------------------------------
const uploadButton = document.getElementById('uploadButton');
const fileUpload = document.getElementById('fileUpload');
const resultSection = document.getElementById('resultSection');
const loadingSpinner = document.getElementById('loadingSpinner');
const loadingMessage = document.getElementById('loadingMessage');
const howToSection = document.getElementById('howToSection');

// -------------------------------------------------------------
// Step 4: 핵심 로직 함수 (최종 수정)
// -------------------------------------------------------------

function showLoading(message) {
    loadingMessage.textContent = message;
    loadingSpinner.classList.remove('hidden');
    loadingSpinner.classList.add('flex');
}

function hideLoading() {
    loadingSpinner.classList.add('hidden');
    loadingSpinner.classList.remove('flex');
}

async function loadModels() {
    if (isModelLoaded) return;
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        isModelLoaded = true;
        console.log('AI 모델 로딩 성공!');
    } catch (error) {
        console.error('AI 모델 로딩 실패:', error);
        alert('AI 모델을 불러오는 데 실패했습니다. 페이지를 새로고침 해주세요.');
    }
}

/**
 * 파일이 선택되었을 때 실행될 메인 분석 함수 (로직 재구성)
 * @param {Event} event
 */
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('AI가 당신의 얼굴을 분석하고 있습니다...');
    howToSection.classList.add('hidden');
    resultSection.innerHTML = '';
    resultSection.classList.add('hidden');

    try {
        const imageElement = await faceapi.bufferToImage(file);
        const detection = await faceapi.detectSingleFace(imageElement).withFaceLandmarks();

        if (!detection) {
            throw new Error('사진에서 얼굴을 찾을 수 없어요.');
        }

        showLoading('피부톤을 정밀하게 분석 중입니다...');
        
        // 💥💥💥 최종 에러 해결: faceapi.extractFaces 사용 💥💥💥
        // 1. 얼굴 영역만 잘라내어 새로운 캔버스로 받는다.
        const faceCanvases = await faceapi.extractFaces(imageElement, [detection]);
        if (faceCanvases.length === 0) {
            throw new Error('얼굴 영역을 추출하는 데 실패했습니다.');
        }
        const faceCanvas = faceCanvases[0];

        // 2. ColorThief에 라이브러리가 만들어준 '깨끗한' 캔버스를 전달한다.
        const colorThief = new ColorThief();
        const dominantColor = colorThief.getColor(faceCanvas); // [r, g, b]
        const skinColorRGB = `rgb(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]})`;
        
        console.log('추출된 피부색 (RGB):', skinColorRGB);
        // 💥💥💥 최종 에러 해결 끝 💥💥💥

        const skinColorLCH = converter('lch')(skinColorRGB);
        const results = classifyPersonalColor(skinColorLCH);
        
        console.log('분석 결과 (상위 3개):', results);
        renderResults(results, imageElement.src);

    } catch (error) {
        console.error('분석 중 에러 발생:', error);
        alert(error.message);
        howToSection.classList.remove('hidden');
    } finally {
        hideLoading();
        fileUpload.value = '';
    }
}

// getSkinColor 함수는 이제 필요 없으므로 삭제되었습니다.

function classifyPersonalColor(skinColorLCH) {
    const ciede2000 = differenceCiede2000();
    
    const distances = Object.entries(centroidsData).map(([seasonId, centroidLCH]) => {
        const distance = ciede2000(skinColorLCH, `lch(${centroidLCH.l} ${centroidLCH.c} ${centroidLCH.h})`);
        return { seasonId, distance };
    });

    distances.sort((a, b) => a.distance - b.distance);

    return distances.slice(0, 3).map(result => ({
        ...result,
        ...palettesData[result.seasonId]
    }));
}

function renderResults(results, imageSrc) {
    // 다음 단계에서 이 함수를 멋지게 꾸밀 예정입니다.
    console.log("Rendering results...", results);
    const topResult = results[0];
    resultSection.innerHTML = `
        <div class="container mx-auto px-4 text-center">
            <h2 class="text-4xl font-bold mb-4">AI 분석 결과</h2>
            <img src="${imageSrc}" alt="Your photo" class="w-48 h-48 rounded-full mx-auto my-6 border-4 border-white shadow-lg object-cover">
            <p class="text-2xl font-semibold">${topResult.name_ko} (${topResult.name_en})</p>
            <p class="text-lg text-gray-600 mt-2">${topResult.description_ko}</p>
            <p class="mt-4">
                (다음 단계에서 Human-in-the-Loop UI를 구현하여 더 예쁘게 표시됩니다.)
            </p>
        </div>
    `;
    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

// -------------------------------------------------------------
// Step 5: 이벤트 리스너 및 초기화 함수 실행
// -------------------------------------------------------------
uploadButton.addEventListener('click', async () => {
    if (!isModelLoaded) {
        showLoading('AI 모델을 준비하고 있습니다...');
        await loadModels();
        hideLoading();
    }
    if (isModelLoaded) {
        fileUpload.click();
    }
});

fileUpload.addEventListener('change', handleImageUpload);

async function preloadData() {
    try {
        const [palettesRes, centroidsRes] = await Promise.all([
            fetch(`${DATA_URL}/palettes.json`),
            fetch(`${DATA_URL}/centroids.json`)
        ]);
        if (!palettesRes.ok || !centroidsRes.ok) {
            throw new Error('데이터 파일을 불러오는 데 실패했습니다.');
        }
        palettesData = await palettesRes.json();
        centroidsData = await centroidsRes.json();
        console.log('데이터 파일 로딩 성공!');
    } catch (error) {
        console.error('데이터 파일 로딩 실패:', error);
        alert(error.message);
    }
}

preloadData();