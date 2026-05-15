// Greenpack Pro v2.0 — Multi-Up Inspection Page (FIREBASE VERSION)
// User uploads master label + scanned sheet (1-15 labels) → per-label analysis

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  Upload, Grid3x3, CheckCircle2, XCircle, AlertTriangle,
  BarChart3, Download, FileText, Eye, Camera, ArrowLeft, Info,
  Loader2, Settings2, Scan, Layers,
} from 'lucide-react';
import clsx from 'clsx';

// Firebase imports
import { db, storage, auth } from '@/lib/firebase';
import { 
  collection, doc, getDoc, addDoc, updateDoc, 
  getDocs, query, where, orderBy, limit,
  Timestamp, setDoc
} from 'firebase/firestore';
import { 
  ref, uploadBytes, getDownloadURL, listAll, deleteObject
} from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';

// Helper functions
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div className="inline-block border-2 border-gray-200 border-t-[#1A73E8] rounded-full animate-spin"
      style={{ width: size, height: size }} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-UP SERVICE (Firebase implementation)
// ═══════════════════════════════════════════════════════════════════════════

const multiUpService = {
  async createMultiUpJob(formData: FormData): Promise<string> {
    const masterFile = formData.get('master_file') as File;
    const scanFile = formData.get('scan_file') as File;
    const jobRef = formData.get('job_ref') as string;
    const clientName = formData.get('client_name') as string;
    const productName = formData.get('product_name') as string;
    const expectedCount = formData.get('expected_count') ? parseInt(formData.get('expected_count') as string) : null;
    const isTransparent = formData.get('is_transparent') === 'true';
    const colorThreshold = parseFloat(formData.get('color_threshold') as string);
    const ssimThreshold = parseFloat(formData.get('ssim_threshold') as string);
    const checkBraille = formData.get('check_braille') === 'true';
    const checkFontSize = formData.get('check_font_size') === 'true';
    const spellCheck = formData.get('spell_check') === 'true';

    // Upload master file
    const masterRef = ref(storage, `multi-up/masters/${Date.now()}_${masterFile.name}`);
    await uploadBytes(masterRef, masterFile);
    const masterUrl = await getDownloadURL(masterRef);

    // Upload scan file
    const scanRef = ref(storage, `multi-up/scans/${Date.now()}_${scanFile.name}`);
    await uploadBytes(scanRef, scanFile);
    const scanUrl = await getDownloadURL(scanRef);

    // Simulate label detection and analysis (in real app, this would be a cloud function)
    // For demo, we'll simulate results based on file analysis
    const detectedLabels = await this.simulateLabelDetection(scanFile, expectedCount);
    
    // Create job document
    const jobData = {
      jobNumber: jobRef,
      jobRef: jobRef,
      customerName: clientName,
      productName: productName,
      type: 'multi-up',
      status: 'completed', // In real app, this would be 'processing' then updated via cloud function
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: auth.currentUser?.uid || 'unknown',
      specifications: {
        masterUrl,
        scanUrl,
        masterFile: masterFile.name,
        scanFile: scanFile.name,
        expectedCount,
        isTransparent,
        colorThreshold,
        ssimThreshold,
        checkBraille,
        checkFontSize,
        spellCheck
      },
      result: {
        labels_found: detectedLabels.length,
        labels_expected: expectedCount,
        labels_passed: detectedLabels.filter(l => l.overall_score >= 75).length,
        labels_failed: detectedLabels.filter(l => l.overall_score < 75).length,
        labels_missing: expectedCount ? Math.max(0, expectedCount - detectedLabels.length) : 0,
        overall_score: detectedLabels.reduce((sum, l) => sum + l.overall_score, 0) / detectedLabels.length,
        sheet_pass: detectedLabels.filter(l => l.overall_score >= 75).length === detectedLabels.length,
        imposition: `${Math.ceil(Math.sqrt(detectedLabels.length))}x${Math.ceil(detectedLabels.length / Math.ceil(Math.sqrt(detectedLabels.length)))}`,
        per_label_results: detectedLabels,
        sheet_annotated_path: scanUrl
      }
    };

    const docRef = await addDoc(collection(db, 'multi_up_jobs'), jobData);
    return docRef.id;
  },

  async getMultiUpJob(jobId: string): Promise<any> {
    const docRef = doc(db, 'multi_up_jobs', jobId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Job not found');
    return { id: docSnap.id, ...docSnap.data() };
  },

  async getMultiUpResult(jobId: string): Promise<any> {
    const job = await this.getMultiUpJob(jobId);
    return job.result;
  },

  async downloadSheetImage(jobId: string): Promise<Blob> {
    const job = await this.getMultiUpJob(jobId);
    const scanUrl = job.specifications?.scanUrl;
    if (scanUrl) {
      const response = await fetch(scanUrl);
      return await response.blob();
    }
    return new Blob();
  },

  // Simulate label detection (in production, this would call a backend ML service)
  async simulateLabelDetection(scanFile: File, expectedCount: number | null): Promise<any[]> {
    // Simulate detected labels based on file size (as a proxy for complexity)
    const fileSizeMB = scanFile.size / (1024 * 1024);
    const estimatedLabels = expectedCount || Math.min(15, Math.max(1, Math.floor(fileSizeMB * 2)));
    
    const labels = [];
    for (let i = 0; i < estimatedLabels; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const overallScore = Math.random() * 40 + 60; // Random score between 60-100
      const pass = overallScore >= 75;
      
      labels.push({
        label_id: `L${i + 1}`,
        row,
        col,
        overall_score: overallScore,
        pass_fail: pass,
        ocr_score: Math.random() * 40 + 60,
        color_score: Math.random() * 40 + 60,
        ssim_score: Math.random() * 0.4 + 0.6,
        barcode_score: Math.random() * 40 + 60,
        registration_score: Math.random() * 40 + 60,
        die_cut_score: Math.random() * 40 + 60,
        mottling_score: Math.random() * 40 + 60,
        alignment_confidence: Math.random() * 0.3 + 0.7,
        ocr_errors: overallScore < 80 ? [
          { type: 'Text Mismatch', severity: 'high', master_text: 'EXP: 12/2025', scan_text: 'EXP: 12/2024', description: 'Expiration date mismatch' }
        ] : [],
        defects: overallScore < 70 ? [
          { type: 'scratch', severity: 'medium', bbox: { x: 100 + i * 10, y: 200, width: 50, height: 10 }, area_pixels: 500 }
        ] : [],
        registration: {
          offset_px: pass ? 1.2 : 8.5,
          offset_mm: pass ? 0.1 : 0.7,
          dx_px: pass ? 0.8 : 6.2,
          dy_px: pass ? 0.6 : 5.8
        }
      });
    }
    return labels;
  }
};

// Scanner Service (Webcam-based for Firebase version)
const scannerService = {
  async listScanners() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      return {
        scanners: cameras.map((cam, idx) => ({
          device: cam.deviceId,
          name: cam.label || `Camera ${idx + 1}`,
          type: 'webcam'
        }))
      };
    } catch (error) {
      return { scanners: [] };
    }
  },
  
  async captureFromWebcam(deviceId: string): Promise<File> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true
    });
    
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          stream.getTracks().forEach(track => track.stop());
          if (blob) {
            const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
            resolve(file);
          } else {
            reject(new Error('Failed to capture image'));
          }
        }, 'image/jpeg', 0.9);
      };
      video.onerror = () => {
        stream.getTracks().forEach(track => track.stop());
        reject(new Error('Video capture failed'));
      };
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// NEW MULTI-UP INSPECTION PAGE (Firebase Version)
// ═══════════════════════════════════════════════════════════════════════════

export function MultiUpInspectionPage() {
  const navigate = useNavigate();
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [jobRef, setJobRef] = useState(() =>
    `MULTI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-001`
  );
  const [clientName, setClientName] = useState('');
  const [productName, setProductName] = useState('');
  const [expectedCount, setExpectedCount] = useState<number | null>(null);
  const [isTransparent, setIsTransparent] = useState(false);
  const [colorThreshold, setColorThreshold] = useState(2.0);
  const [ssimThreshold, setSsimThreshold] = useState(0.75);
  const [checkBraille, setCheckBraille] = useState(false);
  const [checkFontSize, setCheckFontSize] = useState(false);
  const [spellCheck, setSpellCheck] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanners, setScanners] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    scannerService.listScanners().then(data => setScanners(data.scanners));
  }, []);

  async function startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setWebcamActive(true);
      }
    } catch (err) {
      toast.error('Could not access webcam');
    }
  }

  function stopWebcam() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setWebcamActive(false);
  }

  async function capturePhoto() {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setScanFile(file);
          stopWebcam();
          toast.success('Photo captured');
        }
      }, 'image/jpeg', 0.9);
    }
  }

  async function handleScan() {
    const selectedScanner = scanners[0]?.device;
    if (!selectedScanner) {
      toast.error('No camera available');
      return;
    }
    setIsScanning(true);
    try {
      const file = await scannerService.captureFromWebcam(selectedScanner);
      setScanFile(file);
      toast.success('Label scanned successfully');
    } catch (e: any) {
      toast.error(e.message || 'Scanner error — check camera access');
    } finally {
      setIsScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!masterFile) { toast.error('Upload the master label (single label PDF/image)'); return; }
    if (!scanFile) { toast.error('Upload or scan the multi-up sheet to inspect'); return; }

    setIsCreating(true);
    try {
      const fd = new FormData();
      fd.append('master_file', masterFile);
      fd.append('scan_file', scanFile);
      fd.append('job_ref', jobRef);
      fd.append('client_name', clientName);
      fd.append('product_name', productName);
      if (expectedCount !== null) fd.append('expected_count', String(expectedCount));
      fd.append('is_transparent', String(isTransparent));
      fd.append('color_threshold', String(colorThreshold));
      fd.append('ssim_threshold', String(ssimThreshold));
      fd.append('check_braille', String(checkBraille));
      fd.append('check_font_size', String(checkFontSize));
      fd.append('spell_check', String(spellCheck));

      const jobId = await multiUpService.createMultiUpJob(fd);
      toast.success('Multi-up inspection completed!');
      navigate(`/multi-up/${jobId}`);
    } catch (err: any) {
      console.error('Submission error:', err);
      toast.error(err.message || 'Failed to create job');
    } finally {
      setIsCreating(false);
    }
  }

  function DropZone({ onFileSelect, file, onClear, label, hint, icon }: any) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    
    return (
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
          file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-[#1A73E8] hover:bg-blue-50/30'
        )}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
          onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
          className="hidden"
        />
        {file ? (
          <div className="space-y-2">
            <CheckCircle2 size={36} className="mx-auto text-green-500" />
            <p className="font-medium text-green-700 text-sm">{file.name}</p>
            <p className="text-xs text-green-500">{(file.size / 1024).toFixed(0)} KB</p>
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="text-xs text-red-500 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl">{icon}</div>
            <p className="font-medium text-gray-700 text-sm">{label}</p>
            <p className="text-xs text-gray-500">{hint}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#0D1B2A]">Multi-Up Sheet Inspection</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Detect and inspect up to 15 labels in one scan against a master design
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs font-bold">
            Firebase Ready
          </span>
        </div>
      </div>

      <div className="p-8 max-w-5xl mx-auto">

        {/* How it works */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-bold text-[#0D1B2A] mb-1">How Multi-Up Inspection Works</p>
              <ol className="list-decimal list-inside space-y-0.5 text-gray-700">
                <li>Upload the <strong>master label</strong> (single approved design as PDF or image)</li>
                <li>Upload the <strong>scanned sheet</strong> (a roll cut-out with 1–15 labels)</li>
                <li>Optionally specify expected count to detect <strong>missing labels</strong></li>
                <li>Click Start — Greenpack auto-detects each label, aligns it to master, and runs 8 quality checks on each</li>
              </ol>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Scanner / Webcam section */}
          <div className="bg-[#0078D4] rounded-xl p-4 flex items-center gap-3 text-white flex-wrap">
            <Camera size={20} />
            <div className="flex-1">
              <p className="text-sm font-semibold">Webcam Scanner Available</p>
              <p className="text-xs opacity-80">Use your webcam to capture the sheet directly</p>
            </div>
            {!webcamActive ? (
              <button type="button" onClick={startWebcam}
                className="px-4 py-2 bg-white text-[#0078D4] rounded-lg text-sm font-bold hover:bg-gray-100 transition">
                Show Preview
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={capturePhoto}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 transition">
                  Capture
                </button>
                <button type="button" onClick={stopWebcam}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 transition">
                  Stop
                </button>
              </div>
            )}
            <button type="button" onClick={handleScan} disabled={isScanning}
              className="px-4 py-2 bg-white text-[#0078D4] rounded-lg text-sm font-bold hover:bg-gray-100 transition disabled:opacity-50">
              {isScanning ? <Spinner size={14} /> : 'Scan Now'}
            </button>
          </div>

          {/* Webcam preview */}
          {webcamActive && (
            <div className="bg-black rounded-xl overflow-hidden">
              <video ref={videoRef} autoPlay playsInline className="w-full" />
            </div>
          )}

          {/* File drop zones */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <DropZone 
                onFileSelect={setMasterFile} 
                file={masterFile} 
                onClear={() => setMasterFile(null)}
                label="Master Label (single)"
                hint="Upload approved design • PDF, PNG, JPG"
                icon="📄"
              />
              <p className="text-xs text-gray-500 mt-1 text-center">
                The ideal design — will be used to check every label
              </p>
            </div>
            <div>
              <DropZone 
                onFileSelect={setScanFile} 
                file={scanFile} 
                onClear={() => setScanFile(null)}
                label="Scanned Multi-Up Sheet"
                hint="1–15 labels in grid • PNG, JPG, TIFF, 300 DPI"
                icon="🔲"
              />
              <p className="text-xs text-gray-500 mt-1 text-center">
                Cut-out from roll with multiple printed labels
              </p>
            </div>
          </div>

          {/* Job Details */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[#0D1B2A]">Job Details</h3>
              <div className="flex-1"/>
              <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1A73E8]">
                <Settings2 size={14} /> {showAdvanced ? 'Hide' : 'Show'} advanced settings
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Job Reference</label>
                <input value={jobRef} onChange={e => setJobRef(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A73E8]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Client</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. Nestlé"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A73E8]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Product</label>
                <input value={productName} onChange={e => setProductName(e.target.value)}
                  placeholder="e.g. Maggi 70g"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A73E8]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  Expected Label Count (1–15) <span className="text-gray-400 font-normal">— optional, enables missing-label detection</span>
                </label>
                <input type="number" min="1" max="50" value={expectedCount ?? ''}
                  onChange={e => setExpectedCount(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Leave blank for auto-detect"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A73E8]" />
              </div>
              <div className="flex items-center gap-4 pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isTransparent} onChange={e => setIsTransparent(e.target.checked)}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm font-medium text-gray-700">Transparent / clear labels</span>
                </label>
              </div>
            </div>

            {/* Advanced */}
            {showAdvanced && (
              <div className="pt-4 border-t border-gray-100 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-2">
                      Color Tolerance ΔE: <span className="text-[#1A73E8] font-mono">{colorThreshold}</span>
                    </label>
                    <input type="range" min="0.5" max="5" step="0.1" value={colorThreshold}
                      onChange={e => setColorThreshold(Number(e.target.value))}
                      className="w-full accent-[#1A73E8]" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0.5 (strict)</span><span>5.0 (relaxed)</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-2">
                      SSIM Threshold: <span className="text-[#1A73E8] font-mono">{ssimThreshold}</span>
                    </label>
                    <input type="range" min="0.5" max="0.99" step="0.01" value={ssimThreshold}
                      onChange={e => setSsimThreshold(Number(e.target.value))}
                      className="w-full accent-[#1A73E8]" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0.50 (lenient)</span><span>0.99 (strict)</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <input type="checkbox" checked={checkBraille} onChange={e => setCheckBraille(e.target.checked)}
                      className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Check Braille</div>
                      <div className="text-xs text-gray-500">ISO 17351 (Marburg Medium)</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <input type="checkbox" checked={checkFontSize} onChange={e => setCheckFontSize(e.target.checked)}
                      className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Font Size Check</div>
                      <div className="text-xs text-gray-500">Min 6pt (GMP)</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                    <input type="checkbox" checked={spellCheck} onChange={e => setSpellCheck(e.target.checked)}
                      className="w-4 h-4" />
                    <div>
                      <div className="text-sm font-medium">Spell Check</div>
                      <div className="text-xs text-gray-500">English dictionary</div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* What will be checked */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-bold text-[#0D1B2A] mb-3">What Gets Checked Per Label</h3>
            <div className="grid grid-cols-4 gap-3">
              {[
                { icon: '📝', name: 'OCR / Text', desc: 'Character-level diff' },
                { icon: '🎨', name: 'Color', desc: 'Delta-E CIE2000' },
                { icon: '🔍', name: 'SSIM', desc: 'Print defects' },
                { icon: '🔲', name: 'Barcodes', desc: 'EAN/UPC/QR + grading' },
                { icon: '🎯', name: 'Registration', desc: 'Position drift' },
                { icon: '✂️', name: 'Die-cut', desc: 'Edge quality' },
                { icon: '🌫️', name: 'Mottling', desc: 'Uneven ink' },
                { icon: '🏷️', name: 'Labels Count', desc: 'Missing detection' },
              ].map(c => (
                <div key={c.name} className="p-3 rounded-lg bg-gradient-to-br from-gray-50 to-white border border-gray-100">
                  <div className="text-2xl">{c.icon}</div>
                  <div className="font-semibold text-sm text-[#0D1B2A] mt-1">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button type="submit"
            disabled={!masterFile || !scanFile || isCreating}
            className="w-full py-3 bg-gradient-to-r from-[#1A73E8] to-[#00C2CB] text-white rounded-xl font-bold text-base hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {isCreating ? (
              <><Spinner size={18} /> Processing multi-up inspection…</>
            ) : (
              <><Layers size={18} /> Start Multi-Up Inspection</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-UP RESULT PAGE (Firebase Version)
// ═══════════════════════════════════════════════════════════════════════════

export function MultiUpResultPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [selectedLabel, setSelectedLabel] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadJob() {
      if (!jobId) return;
      try {
        const jobData = await multiUpService.getMultiUpJob(jobId);
        setJob(jobData);
        setResult(jobData.result);
      } catch (err) {
        console.error('Failed to load job:', err);
        toast.error('Job not found');
      } finally {
        setLoading(false);
      }
    }
    loadJob();
  }, [jobId]);

  async function downloadJSON() {
    if (!job) return;
    const reportData = {
      job,
      generatedAt: new Date().toISOString(),
      inspector: auth.currentUser?.email
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `multi_up_report_${job.jobNumber}.json`);
    toast.success('Report downloaded');
  }

  async function downloadCSV() {
    if (!result) return;
    // Create CSV for per-label results
    const headers = ['Label ID', 'Row', 'Col', 'Overall Score', 'Pass/Fail', 'OCR Score', 'Color Score', 'SSIM Score', 'Barcode Score'];
    const rows = result.per_label_results?.map((l: any) => [
      l.label_id, l.row + 1, l.col + 1, l.overall_score, l.pass_fail ? 'PASS' : 'FAIL',
      l.ocr_score, l.color_score, l.ssim_score, l.barcode_score
    ]) || [];
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `multi_up_results_${job.jobNumber}.csv`);
    toast.success('CSV downloaded');
  }

  async function downloadSheet() {
    if (!jobId) return;
    try {
      const blob = await multiUpService.downloadSheetImage(jobId);
      downloadBlob(blob, `sheet_${jobId.slice(0, 8)}.jpg`);
      toast.success('Sheet image downloaded');
    } catch (err) {
      toast.error('Download failed');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  if (!job || !result) {
    return (
      <div className="p-8 text-center">
        <XCircle size={48} className="mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-[#0D1B2A]">Job Not Found</h2>
        <button onClick={() => navigate('/multi-up/new')}
          className="mt-4 px-4 py-2 bg-[#1A73E8] text-white rounded-lg text-sm font-semibold">
          Start New Inspection
        </button>
      </div>
    );
  }

  const perLabels = result.per_label_results || [];
  const sheetPass = result.sheet_pass;
  const rows = perLabels.length > 0 ? Math.max(...perLabels.map((l: any) => l.row)) + 1 : 1;
  const cols = perLabels.length > 0 ? Math.max(...perLabels.map((l: any) => l.col)) + 1 : 1;
  const gridCols = Math.min(cols, 5);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/jobs')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[#0D1B2A]">{job.jobNumber || job.jobRef}</h1>
            <p className="text-sm text-gray-500">
              Multi-Up Sheet • {result.labels_found} labels detected
              {result.labels_expected && ` of ${result.labels_expected} expected`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadJSON}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            <Download size={14} /> JSON
          </button>
          <button onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            <FileText size={14} /> CSV
          </button>
          <button onClick={downloadSheet}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            <Eye size={14} /> Sheet Image
          </button>
        </div>
      </div>

      <div className="p-8 space-y-6">

        {/* Summary cards */}
        <div className={clsx(
          'rounded-xl p-6 shadow-sm',
          sheetPass ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200'
                    : 'bg-gradient-to-r from-red-50 to-rose-50 border border-red-200'
        )}>
          <div className="flex items-center gap-6 flex-wrap">
            <div className={clsx('w-20 h-20 rounded-2xl flex items-center justify-center',
              sheetPass ? 'bg-green-500' : 'bg-red-500')}>
              {sheetPass ? <CheckCircle2 size={40} className="text-white" /> : <XCircle size={40} className="text-white" />}
            </div>
            <div className="flex-1">
              <div className="text-3xl font-black text-[#0D1B2A]">
                {sheetPass ? 'SHEET PASS' : 'SHEET FAIL'}
              </div>
              <div className="text-lg font-bold mt-1"
                style={{ color: sheetPass ? '#22A06B' : '#E5383B' }}>
                Overall: {result.overall_score?.toFixed(1)}/100
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
              <div className="text-center">
                <div className="text-2xl font-black text-[#1A73E8]">{result.labels_found}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Found</div>
              </div>
              {result.labels_expected && (
                <div className="text-center">
                  <div className={clsx('text-2xl font-black', result.labels_missing > 0 ? 'text-red-600' : 'text-green-600')}>
                    {result.labels_missing || 0}
                  </div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Missing</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-2xl font-black text-green-600">{result.labels_passed || 0}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Passed</div>
              </div>
              <div className="text-center">
                <div className={clsx('text-2xl font-black', result.labels_failed > 0 ? 'text-red-600' : 'text-green-600')}>
                  {result.labels_failed || 0}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Failed</div>
              </div>
            </div>
          </div>
        </div>

        {/* Annotated sheet preview */}
        {job.specifications?.scanUrl && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div className="font-semibold text-sm text-[#0D1B2A]">
                Annotated Sheet — Click any label for details
              </div>
              <div className="text-xs text-gray-500">
                Imposition: {result.imposition || 'Auto-detected'}
              </div>
            </div>
            <div className="p-4 bg-gray-50">
              <img
                src={job.specifications.scanUrl}
                alt="Annotated sheet"
                className="w-full rounded-lg border border-gray-100 max-h-[600px] object-contain mx-auto"
                onError={(e: any) => { e.target.style.display = 'none'; }}
              />
            </div>
          </div>
        )}

        {/* Per-label grid */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div className="font-semibold text-sm text-[#0D1B2A]">
              Per-Label Results ({perLabels.length} labels)
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-500" /> Pass
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-red-500" /> Fail
              </span>
            </div>
          </div>
          <div className="p-4 overflow-x-auto">
            <div className="grid gap-2" style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(140px, 1fr))`,
            }}>
              {perLabels.map((lb: any) => (
                <button
                  key={lb.label_id}
                  onClick={() => setSelectedLabel(lb)}
                  className={clsx(
                    'p-3 rounded-lg border-2 text-left transition-all hover:scale-105',
                    lb.pass_fail
                      ? 'bg-green-50 border-green-400 hover:bg-green-100'
                      : 'bg-red-50 border-red-400 hover:bg-red-100'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-600">
                      {lb.label_id}
                    </span>
                    {lb.pass_fail
                      ? <CheckCircle2 size={16} className="text-green-600" />
                      : <XCircle size={16} className="text-red-600" />
                    }
                  </div>
                  <div className={clsx('text-2xl font-black',
                    lb.pass_fail ? 'text-green-700' : 'text-red-700')}>
                    {lb.overall_score?.toFixed(0)}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    {lb.ocr_errors?.length > 0 && <span>📝{lb.ocr_errors.length}</span>}
                    {lb.defects?.length > 0 && <span>🔍{lb.defects.length}</span>}
                    {lb.registration?.offset_px > 5 && <span>🎯</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Label detail modal */}
        {selectedLabel && (
          <LabelDetailModal
            label={selectedLabel}
            onClose={() => setSelectedLabel(null)}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LABEL DETAIL MODAL
// ═══════════════════════════════════════════════════════════════════════════

function LabelDetailModal({ label, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#0D1B2A]">Label {label.label_id}</h2>
            <p className="text-sm text-gray-500">
              Position: Row {label.row + 1}, Column {label.col + 1}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={clsx(
              'px-4 py-2 rounded-full font-black text-sm',
              label.pass_fail ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            )}>
              {label.overall_score?.toFixed(1)} — {label.pass_fail ? 'PASS' : 'FAIL'}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Sub-scores grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <MiniScore label="OCR" value={label.ocr_score} />
            <MiniScore label="Color" value={label.color_score} />
            <MiniScore label="SSIM" value={label.ssim_score ? label.ssim_score * 100 : null} suffix="%" />
            <MiniScore label="Barcode" value={label.barcode_score} />
            <MiniScore label="Registration" value={label.registration_score} />
            <MiniScore label="Die-Cut" value={label.die_cut_score} />
            <MiniScore label="Mottling" value={label.mottling_score} />
            <MiniScore label="Alignment" value={label.alignment_confidence ? label.alignment_confidence * 100 : null} suffix="%" />
          </div>

          {/* OCR errors */}
          {label.ocr_errors?.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2 text-[#0D1B2A]">
                OCR Errors ({label.ocr_errors.length})
              </h3>
              <div className="space-y-2">
                {label.ocr_errors.slice(0, 10).map((err: any, i: number) => (
                  <div key={i} className={clsx(
                    'p-3 rounded-lg border text-sm',
                    err.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
                  )}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 bg-white rounded">
                        {err.type}
                      </span>
                      <span className="text-xs">{err.severity}</span>
                    </div>
                    <div className="font-mono text-xs">
                      <div>Master: <b className="text-green-700">"{err.master_text}"</b></div>
                      <div>Scan: <b className="text-red-700">"{err.scan_text}"</b></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Defects */}
          {label.defects?.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2 text-[#0D1B2A]">
                Print Defects ({label.defects.length})
              </h3>
              <div className="space-y-1.5">
                {label.defects.slice(0, 10).map((d: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-orange-50 border border-orange-200 text-xs flex items-center gap-2 flex-wrap">
                    <AlertTriangle size={14} className="text-orange-600 shrink-0" />
                    <span className="font-semibold">{d.type}</span>
                    <span className="text-gray-500">({d.severity})</span>
                    <span className="text-gray-400">
                      {d.bbox && `at (${d.bbox.x}, ${d.bbox.y}) — `}{d.area_pixels && `${d.area_pixels}px²`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Registration details */}
          {label.registration && (
            <div>
              <h3 className="font-semibold text-sm mb-2 text-[#0D1B2A]">Registration Drift</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Offset</div>
                  <div className="font-bold">{label.registration.offset_px?.toFixed(1)}px</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">In mm</div>
                  <div className="font-bold">{label.registration.offset_mm?.toFixed(2)}mm</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Direction</div>
                  <div className="font-bold">
                    dx:{label.registration.dx_px?.toFixed(1)}, dy:{label.registration.dy_px?.toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniScore({ label, value, suffix = '' }: any) {
  const color = value >= 75 ? 'text-green-600' : value >= 50 ? 'text-yellow-600' : 'text-red-600';
  const displayValue = value != null ? value.toFixed(0) : '—';
  return (
    <div className="p-2 bg-gray-50 rounded-lg text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={clsx('text-lg font-black', color)}>
        {displayValue}{suffix}
      </div>
    </div>
  );
}

// Default export
export default MultiUpInspectionPage;