# Roadmap

- [x] Save the detected Wi-Fi network name with every measurement (db column + live test page)
- [x] Show the network name on page load ("Connected network" chip), while testing, and in the verdict card
- [x] History: explicit date · time stamp per run + Network column
- [x] Model page: show last training run timestamp + sample count (model retrains on all labeled data automatically)
- [x] Fix stalled-download runs recording 0.0 Mbps (retry with smaller transfer, clear error if still stalled)
- [x] Network-name lookup: three providers with fallback (ipwho.is → ipapi.co → geojs.io)
- [x] End-to-end verification (live test saved with network name; history/model pages correct; zero console errors)
- [x] Removed automated-test rows from history so only real runs remain
- [x] Wi-Fi SSID name (e.g. CGC@C4): user names their network once (browsers cannot read the SSID), it persists on the device and is saved/shown with every run, in history and the verdict card
- [x] Auto-detect the network name (no manual save needed) and adopt it for every run
- [x] Background auto-testing: keep the tab open and the app measures + saves automatically on a timer
- [x] History retention: keep only the last 7 days of runs
- [x] End-to-end verification (auto-run fires and saves, auto name adopted, retention schedule active)
