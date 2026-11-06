import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type ImageSource = 'camera' | 'library';

// The backend accepts JPEG, PNG or WebP up to 5 MB and 20 megapixels. Browsers can hand
// over anything (HEIC, 48 MP photos, huge screenshots), so web uploads are scaled down
// and re-encoded as JPEG before they are sent.
const WEB_MAX_SIDE = 1600;
const WEB_JPEG_QUALITY = 0.85;

function chooseWebFile(source: ImageSource): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Mobile browsers open the rear camera directly; desktop browsers ignore it.
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

async function webFileToJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = document.createElement('img');
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('这张图片无法读取，请换成 JPG 或 PNG 再试。'));
      element.src = url;
    });
    const scale = Math.min(1, WEB_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理图片，请换个浏览器再试。');
    // JPEG has no transparency; paint transparent PNG areas white instead of black.
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', WEB_JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Lets the user take or choose a photo and returns it as base64 (a data URL on the web),
 * or null when they cancel. `onReading` fires once a file is chosen and is being prepared.
 */
export async function pickImage(source: ImageSource, onReading?: () => void): Promise<string | null> {
  if (Platform.OS === 'web') {
    const file = await chooseWebFile(source);
    if (!file) return null;
    onReading?.();
    return webFileToJpeg(file);
  }
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error(source === 'camera'
      ? '需要相机权限才能拍照，请在系统设置里允许后再试。'
      : '需要相册权限才能选图，请在系统设置里允许后再试。');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true,
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const base64 = result.assets[0].base64;
  if (!base64) throw new Error('无法读取图片内容，请换一张图片重试。');
  return base64;
}
