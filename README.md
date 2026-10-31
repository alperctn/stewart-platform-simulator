# 6-DOF Stewart Platform (Ball & Plate) Digital Twin & Web Visualizer

🌐 **Canlı Simülasyon (Live Demo):** [https://alperctn.github.io/stewart-platform-simulator/](https://alperctn.github.io/stewart-platform-simulator/)

Bu proje; 6 Serbestlik Dereceli (6-DOF) paralel manipülatör yapısına sahip **Stewart Platformu tabanlı Top ve Plaka (Ball & Plate) dengeleme sistemi** için geliştirilmiş **Web Tabanlı Sayısal İkiz (Digital Twin), 3D Simülatör ve Gerçek Zamanlı Telemetri** platformudur.

---

## 🚀 Temel Özellikler

- **3D Fizik ve Ters Kinematik Motoru:**
  - 6 adet MG996R servo motor, 3D baskı kollar ve küresel mafsallı bacakların analitik ters kinematiği.
  - Eğik düzlemde kaymadan yuvarlanan küre dinamiği ve alt adımlı Euler entegrasyonu.
  - Three.js tabanlı yüksek kaliteli PBR kaplamalar ve gerçekçi donanım modeli.

- **İnteraktif Top ve Yörünge Kontrolleri:**
  - **Elle Tutma & Bırakma:** Fare ile topu tutup platformun üzerine istenen yükseklikten serbest bırakma (gerçekçi düşme ve sekme fiziği).
  - **Şekil & Yörünge Çizici (Trajectory Follower):** 2D çizim pedi üzerinden serbest şekil çizme veya otomatik şekiller (Daire, Üçgen, Kare, Sekiz) ile topun yörünge takibi.
  - **Görsel Nişangah:** Platform üzerinde neon hedef göstergesi ve anlık hedef yolu izdüşümü.

- **Web Serial API ile Gerçek Zamanlı Donanım Bağlantısı:**
  - Ek yazılım veya sürücü gerektirmeden, doğrudan tarayıcı üzerinden (Google Chrome / MS Edge) fiziksel ESP32 / Arduino donanımına USB üzerinden bağlanma.
  - Çift yönlü telemetri akışı ve anlık PID parametreleri analizi.

- **Gerçek Zamanlı Grafikler (Chart.js):**
  - X / Y Konum, Hız ve Platform Roll / Pitch açıları telemetri grafikleri.

---

## 🛠️ Kullanılan Teknolojiler

- **WebGL / Three.js (r128):** 3D platform kinematiği ve fizik görselleştirmesi.
- **Chart.js:** Gerçek zamanlı telemetri akışı grafikleri.
- **Web Serial API:** Tarayıcı üzerinden mikrodenetleyici donanım iletişimi.
- **Lucide Icons & Modern CSS3:** Responsive cam/karanlık tema kontrol paneli.
