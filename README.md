# 6-DOF Stewart Platform (Ball & Plate) Digital Twin & Web Visualizer

🌐 **Canlı Simülasyon (Live Demo):** [https://alperctn.github.io/stewart-platform-simulator/](https://alperctn.github.io/stewart-platform-simulator/)  
📄 **Bitirme Tezi Raporu (PDF):** [Bitirme_Projesi_Raporu.pdf](Bitirme_Projesi_Raporu.pdf)

Bu proje; Uşak Üniversitesi Mühendislik Fakültesi Elektrik-Elektronik Mühendisliği Bölümü Bitirme Tezi kapsamında geliştirilmiş, 6 Serbestlik Dereceli (6-DOF) paralel manipülatör yapısına sahip **Stewart Platformu tabanlı Top ve Plaka (Ball & Plate) dengeleme sistemi** için **Web Tabanlı Sayısal İkiz (Digital Twin), 3B Fizik Simülatörü ve Gerçek Zamanlı Telemetri** arayüzüdür.

---

## 👥 Proje Ekibi

- **Hazırlayanlar:** Alper ÇETİN (210517038) & Yusuf Emre AKAR (220517042)
- **Tez Danışmanı:** Dr. Öğr. Üyesi Emre KEMER
- **Kurum:** Uşak Üniversitesi Mühendislik Fakültesi Elektrik-Elektronik Mühendisliği Bölümü

---

## 🚀 Temel Özellikler

- **3B Fizik ve Analitik Ters Kinematik Motoru (`simulation.js`):**
  - 6 adet MG996R servo motor, 3D baskı kollar ve küresel mafsallı bacakların analitik ters kinematiği.
  - Eğik düzlemde kaymadan yuvarlanan küre dinamiği ve alt adımlı (sub-stepping) Euler entegrasyonu.
  - Three.js tabanlı yüksek kaliteli PBR kaplamalar ve gerçek donanım ile birebir eşleşen 3D model.

- **İnteraktif Top ve Yörünge Kontrolleri:**
  - **Elle Tutma & Bırakma:** Fare ile topu tutup platformun üzerine istenen yükseklikten serbest bırakma (gerçekçi düşme ve sekme fiziği).
  - **Şekil & Yörünge Çizici (Trajectory Follower):** 2D çizim pedi üzerinden serbest şekil çizme veya otomatik şekiller (Daire, Üçgen, Kare, Sekiz) ile topun yörünge takibi.
  - **Görsel Nişangah:** Platform üzerinde neon hedef göstergesi ve anlık hedef yolu izdüşümü.

- **Web Serial API ile Gerçek Zamanlı Donanım Bağlantısı (`app.js`):**
  - Ek yazılım veya sürücü gerektirmeden, doğrudan tarayıcı üzerinden (Google Chrome / MS Edge) fiziksel ESP32 / Arduino donanımına USB (115200 baud) üzerinden bağlanma.
  - Çift yönlü telemetri akışı ve anlık PID parametreleri analizi.

- **Gerçek Zamanlı Telemetri Grafikleri (`charts.js`):**
  - X / Y Konum, Hız ve Platform Roll / Pitch açıları telemetri grafikleri (Chart.js).

---

## 📂 Dosya ve Kod Yapısı

| Dosya | Boyut / Tür | Açıklama |
| :--- | :--- | :--- |
| `index.html` | Web Arayüzü | Simülasyon, telemetri panelleri, yörünge çizim pedi ve kontrol butonları. |
| `simulation.js` | 3B Fizik Motoru | Three.js sahnesi, Stewart platformu analitik ters kinematiği, top fiziği ve PID döngüsü. |
| `app.js` | Uygulama & Serial | Web Serial API entegrasyonu, telemetri veri işleme, etkileşimli sürükle-bırak ve yörünge takibi. |
| `charts.js` | Grafik Motoru | Chart.js ile gerçek zamanlı telemetri çizimi (konum, hız, eğim). |
| `style.css` | Arayüz Tasarımı | Modern karanlık tema, yarı saydam cam efektleri ve responsive grid düzeni. |
| `Bitirme_Projesi_Raporu.pdf` | Tez Raporu (PDF) | Projenin 9 sayfalık tam akademik raporu (kurulum, ters kinematik, fizik formülleri ve test grafikleri). |

---

## 🛠️ Kurulum ve Çalıştırma

Projeyi çalıştırmak için herhangi bir derleyici, yerel sunucu veya ek kurulum gerekmez.

### 1. Doğrudan Tarayıcıdan Kullanım (Önerilen)
GitHub Pages üzerinden anında test edebilirsiniz:  
👉 **[https://alperctn.github.io/stewart-platform-simulator/](https://alperctn.github.io/stewart-platform-simulator/)**

### 2. Yerel Ortamda Çalıştırma
Depoyu klonlayıp `index.html` dosyasını modern bir tarayıcıda (Chrome, Edge, Brave vb.) açmanız yeterlidir:
```bash
git clone https://github.com/alperctn/stewart-platform-simulator.git
cd stewart-platform-simulator
# Doğrudan index.html'i açabilir veya yerel bir sunucu ile başlatabilirsiniz:
python -m http.server 8000
```
