// -------------------------------------------------------------
// Step 0: 스타일시트 임포트 (Vite 환경)
// -------------------------------------------------------------
import './input.css';

// -------------------------------------------------------------
// Step 1: 모듈 임포트
// -------------------------------------------------------------
import * as faceapi from '@vladmandic/face-api';
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
// Step 4: 핵심 로직 함수 (최종 안정화 버전)
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
        ]);
        isModelLoaded = true;
        console.log('필수 AI 모델 로딩 성공!');
    } catch (error) {
        console.error('AI 모델 로딩 실패:', error);
        alert('AI 모델을 불러오는 데 실패했습니다. 페이지를 새로고침 해주세요.');
    }
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('AI가 당신의 얼굴을 분석하고 있습니다...');
    howToSection.classList.add('hidden');
    resultSection.innerHTML = '';
    resultSection.classList.add('hidden');

    try {
        const imageElement = await faceapi.bufferToImage(file);
        const fullFaceDescription = await faceapi.detectSingleFace(imageElement).withFaceLandmarks();

        if (!fullFaceDescription) {
            throw new Error('사진에서 얼굴을 찾을 수 없어요. 더 선명하거나 큰 사진으로 시도해보세요.');
        }

        showLoading('피부톤을 정밀하게 분석 중입니다...');

        const faceDetections = [fullFaceDescription.detection];
        const faceCanvases = await faceapi.extractFaces(imageElement, faceDetections);

        if (faceCanvases.length === 0) {
            throw new Error('얼굴 영역을 추출하는 데 실패했습니다.');
        }

        const faceCanvas = faceCanvases[0];
        const ctx = faceCanvas.getContext('2d', { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, faceCanvas.width, faceCanvas.height);
        const data = imageData.data;
        const colorCounts = {};
        let maxCount = 0;
        let dominantColor = [0, 0, 0];
        
        for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const rgb = `${r},${g},${b}`;
            colorCounts[rgb] = (colorCounts[rgb] || 0) + 1;
            if (colorCounts[rgb] > maxCount) {
                maxCount = colorCounts[rgb];
                dominantColor = [r, g, b];
            }
        }
        
        const skinColorRGB = `rgb(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]})`;
        const skinColorLCH = converter('lch')(skinColorRGB);
        const results = classifyPersonalColor(skinColorLCH);
        
        renderChoiceUI(results, imageElement.src);

    } catch (error) {
        console.error('분석 중 에러 발생:', error);
        alert(error.message);
        howToSection.classList.remove('hidden');
    } finally {
        hideLoading();
        fileUpload.value = '';
    }
}

function classifyPersonalColor(skinColorLCH) {
    const ciede2000 = differenceCiede2000();
    const distances = Object.entries(centroidsData).map(([seasonId, centroidLCH]) => {
        const distance = ciede2000(skinColorLCH, `lch(${centroidLCH.l} ${centroidLCH.c} ${centroidLCH.h})`);
        return { seasonId, distance };
    });
    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, 2).map(result => ({
        ...result,
        ...palettesData[result.seasonId]
    }));
}

/**
 * 🎨 Step 5: 최종 결과 렌더링 함수 (요청하신 최종 디자인)
 */

function renderChoiceUI(results, imageSrc) {
    const [first, second] = results;
    const firstMatchRate = Math.max(0, 100 - first.distance * 1.5).toFixed(1);
    const secondMatchRate = Math.max(0, 100 - second.distance * 1.5).toFixed(1);
    
    // 후보 카드를 생성하는 함수 (고급진 UI 최종 버전)
    const createChoiceCard = (result, matchRate) => {
        const escapedResult = JSON.stringify(result).replace(/'/g, '&apos;');
        return `
            <div class="choice-card group relative bg-white rounded-xl shadow-lg p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-2" data-result='${escapedResult}' data-image-src="${imageSrc}">
                <span class="absolute top-3 right-3 bg-indigo-500 text-white text-xs font-semibold px-3 py-1 rounded-full transition-opacity duration-300 opacity-0 group-hover:opacity-100">${matchRate}%</span>
                
                <div class="text-center">
                    <h3 class="text-2xl font-bold text-gray-800">${result.name_ko}</h3>
                    <p class="text-md text-gray-500 mb-4">${result.name_en}</p>
                    <div class="flex flex-wrap justify-center gap-2 mb-4">
                        ${result.keywords_ko.slice(0, 3).map(kw => `<span class="bg-gray-200 text-gray-700 text-sm font-medium px-3 py-1 rounded-full">#${kw}</span>`).join('')}
                    </div>
                    <div class="flex justify-center space-x-2">
                        ${result.palette.filter(p => p.category === 'point').slice(0, 5).map(color => `<div class="w-10 h-10 rounded-full shadow" style="background-color: ${color.hex};"></div>`).join('')}
                    </div>
                </div>
            </div>
        `;
    };

    resultSection.innerHTML = `
        <div class="container mx-auto px-4 py-16 text-center">
            <h2 class="text-3xl md:text-4xl font-bold mb-4">AI가 찾은 당신의 잠재 컬러 🎨</h2>
            <p class="text-lg text-gray-600 mb-12">두 타입 중 당신의 마음에 더 와닿는 컬러를 선택해주세요.</p>
            <div class="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                ${createChoiceCard(first, firstMatchRate)}
                ${createChoiceCard(second, secondMatchRate)}
            </div>
        </div>
    `;

    resultSection.classList.remove('hidden');
    resultSection.querySelectorAll('.choice-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const resultData = JSON.parse(e.currentTarget.dataset.result.replace(/&apos;/g, "'"));
            const imgSrc = e.currentTarget.dataset.imageSrc;
            renderFinalResult(resultData, imgSrc);
        });
    });
    resultSection.scrollIntoView({ behavior: 'smooth' });
}


function renderFinalResult(result, imageSrc) {
    const renderPalette = (title, category) => {
        const colors = result.palette.filter(p => p.category === category);
        if (colors.length === 0) return '';
        return `
            <div>
                <h4 class="text-xl font-bold mb-4 text-gray-700">${title}</h4>
                <div class="grid grid-cols-5 gap-3">
                    ${colors.map(color => `
                        <div class="text-center">
                            <div class="w-full h-16 rounded-lg shadow-inner mb-2" style="background-color: ${color.hex};"></div>
                            <p class="text-xs font-semibold text-gray-800">${color.name_ko}</p>
                            <p class="text-xs text-gray-500">${color.hex}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };

    resultSection.innerHTML = `
        <div id="final-result-capture" class="bg-slate-50 py-16">
            <div class="container mx-auto px-4 max-w-3xl">
                <div class="bg-white p-8 md:p-12 rounded-2xl shadow-2xl text-center">
                    <p class="font-semibold text-indigo-600">AI 최종 진단 결과</p>
                    <h2 class="text-4xl md:text-5xl font-extrabold my-3 text-gray-800">${result.name_ko}</h2>
                    <p class="text-lg text-gray-500 mb-8">${result.name_en}</p>
                    
                    <img src="${imageSrc}" alt="Your photo" class="w-40 h-40 md:w-48 md:h-48 rounded-full mx-auto my-6 border-4 border-white shadow-xl object-cover">
                    
                    <p class="text-base text-gray-700 leading-relaxed max-w-xl mx-auto mb-12">${result.description_ko}</p>

                    <div class="space-y-12">
                        ${renderPalette('BEST 💖 찰떡 컬러', 'point')}
                        ${renderPalette('NEUTRAL 👍 무난템 컬러', 'base')}
                        ${renderPalette('WORST 👻 워스트 컬러', 'worst')}
                    </div>
                </div>
            </div>
        </div>
        <div class="bg-slate-50 pb-16 text-center">
            <h3 class="text-2xl font-bold mb-4 text-gray-800">결과를 저장하고 공유해보세요!</h3>
            <div class="flex justify-center items-center space-x-4">
                 <button id="saveButton" class="bg-gray-700 hover:bg-black text-white font-bold py-3 px-8 rounded-lg shadow-lg transition-transform duration-200 hover:scale-105">이미지 저장</button>
                 <button id="shareButton" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg shadow-lg transition-transform duration-200 hover:scale-105">SNS 공유하기</button>
            </div>
        </div>
    `;
    resultSection.scrollIntoView({ behavior: 'smooth' });

    document.getElementById('saveButton').addEventListener('click', () => handleShare('save'));
    document.getElementById('shareButton').addEventListener('click', () => handleShare('share'));
}

async function handleShare(action) {
    const captureElement = document.getElementById('final-result-capture');
    if (!captureElement) return;

    showLoading('결과 이미지를 생성 중입니다...');
    
    try {
        const canvas = await html2canvas(captureElement, { scale: 2, backgroundColor: null });
        const fileName = 'my-personal-color.png';

        if (action === 'save' || !navigator.share) {
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = fileName;
            link.click();
        } else {
             canvas.toBlob(async (blob) => {
                const file = new File([blob], fileName, { type: 'image/png' });
                try {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: 'AI 퍼스널 컬러 진단 결과!',
                            text: '내 퍼스널 컬러 결과를 확인해보세요!',
                            files: [file]
                        });
                    } else {
                        throw new Error('이 브라우저에서는 파일 공유를 지원하지 않습니다.');
                    }
                } catch(err) {
                    console.error('공유 실패:', err);
                    alert('결과를 공유하는 데 실패했습니다. 대신 이미지를 저장해주세요.');
                    const link = document.createElement('a');
                    link.href = canvas.toDataURL('image/png');
                    link.download = fileName;
                    link.click();
                }
            }, 'image/png');
        }
    } catch (err) {
        console.error('이미지 생성/공유 실패:', err);
        alert('결과 이미지를 생성하는 데 실패했습니다.');
    } finally {
        hideLoading();
    }
}

// -------------------------------------------------------------
// Step 6: 이벤트 리스너 및 초기화 함수 실행
// -------------------------------------------------------------
uploadButton.addEventListener('click', async () => {
    if (!isModelLoaded) {
        showLoading('AI 모델을 처음으로 준비하고 있습니다...');
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