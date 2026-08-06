import { driveApi } from "../api/files";

/**
 * Google'ın resmi Picker widget'ı — kullanıcı kendi Drive'ında TARAYICIDA gezinip
 * bir dosya seçer, backend'e hiç uğramaz.
 *
 * Bunu OneDrive'daki özel gezinme arayüzünün (bkz. BrowseDriveModal.tsx) yerine
 * kullanıyoruz çünkü Picker'dan seçilen her dosya için Google, uygulamanın zaten
 * sahip olduğu dar `drive.file` scope'una otomatik olarak kalıcı erişim veriyor —
 * Google'ın "Drive'ın tamamını gör" (`drive.readonly`) scope'u ücretli/uzun bir
 * CASA güvenlik denetimi gerektirdiği için bundan bilinçli olarak kaçınıyoruz
 * (bkz. proje kararları).
 */

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let gapiLoadPromise: Promise<void> | null = null;

function loadGapiScript(): Promise<void> {
  if (window.gapi?.load) return Promise.resolve();
  if (gapiLoadPromise) return gapiLoadPromise;

  gapiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Picker kütüphanesi yüklenemedi"));
    document.head.appendChild(script);
  });
  return gapiLoadPromise;
}

let pickerModuleLoadPromise: Promise<void> | null = null;

function loadPickerModule(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (pickerModuleLoadPromise) return pickerModuleLoadPromise;

  pickerModuleLoadPromise = new Promise((resolve, reject) => {
    window.gapi.load("picker", {
      callback: () => resolve(),
      onerror: () => reject(new Error("Google Picker modülü yüklenemedi")),
    });
  });
  return pickerModuleLoadPromise;
}

export interface PickedDriveFile {
  id: string;
  name: string;
}

/**
 * Picker'ı açar; kullanıcı bir dosya seçince `onPicked` çağrılır. Kullanıcı
 * pencereyi kapatırsa hiçbir şey olmaz.
 */
export async function openGooglePicker(onPicked: (file: PickedDriveFile) => void): Promise<void> {
  const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error("Google Picker yapılandırılmamış (VITE_GOOGLE_PICKER_API_KEY eksik).");
  }

  const [{ accessToken }] = await Promise.all([driveApi.pickerToken(), loadGapiScript()]);
  await loadPickerModule();

  const google = window.google;
  const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);

  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .setCallback((data: any) => {
      if (data.action !== google.picker.Action.PICKED) return;
      const doc = data.docs?.[0];
      if (!doc) return;
      onPicked({ id: doc.id, name: doc.name });
    })
    .build();

  picker.setVisible(true);
}
