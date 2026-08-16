<div align="center">

# 🎬 Watcher

**The Ultimate Cinematic Companion & Discovery Platform**

[![React Native](https://img.shields.io/badge/React_Native-0.86.2-blue.svg?style=for-the-badge&logo=react)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK_57-black.svg?style=for-the-badge&logo=expo)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

A sleek, fluid, and state-of-the-art mobile application for cinema lovers. Discover trending releases, get intelligent AI-powered movie insights, track your watchlist, explore franchise collections, and seamlessly stream and download content.

---

</div>

## ✨ Key Features

### 🌟 1. Dynamic Explore & Hero Showcase
- **Luminous Glass Hero Carousel**: Fluid parallax slider highlighting the newest released movies with interactive glowing capsule indicators and smooth momentum physics.
- **Tailored For You Feed**: Personalized content curated around your preferred languages (*Hollywood, Korean, Turkish, Japanese, Hindi, Malayalam, etc.*), favorite genres, and favorite actors.
- **Smart Recommendations**: *"Because you watched..."* dynamic feeds built from your local watch history.
- **Deep Discovery**: Explore by trending movies, top-rated classics, upcoming titles, and hidden gems.

### 🎭 2. Rich Movie & TV Details
- **Comprehensive Metadata**: High-definition backdrops, trailers, runtime, certification ratings (*PG-13, R, TV-MA*), spoken languages, and production countries.
- **Cast & Crew Filmographies**: Explore detailed profiles of directors, creators, and cast members with their full career credits.
- **Franchise Collections**: Seamlessly browse linked movie universes and collections (e.g. *The Dark Knight Trilogy, Marvel Cinematic Universe*).
- **Embedded Streaming Player**: Full-screen video player with resume playback, episode selection, and progress tracking.

### 🤖 3. AI Cinema Companion & Lens
- **AI Lens Insights**:
  - **Friend Verdict**: Honest, casual take on whether a title is worth your time.
  - **Story & Premise**: Compelling story overview and plot hook without ruining ending spoilers.
  - **Content Advisory & Warnings**: Age rating certification details and content warnings.
  - **Vibe Tags**: Instant mood and tone breakdown.
- **Contextual Movie Chat**: In-tab AI companion that answers questions specifically about the movie you're looking at (*director's style, symbolism, plot theories, character motives*).
- **Full AI Chat Tab**: Dedicated conversational AI assistant with customizable persona, comparison tables, structured top-10 lists, and interactive recommendation cards.

### 📑 4. Smart Library & Watchlist
- **Multi-Category Tracking**: Save movies, TV series, favorite actors, and full movie franchises to your personal library.
- **Advanced Filtering & Sorting**: Filter your watchlist by type, genre, language, or sort by release date and rating.
- **Watch History & Progress**: Automatically logs watched items with one-tap toggle and progress indicators.

### 🧲 5. Integrated Torrent Search & Scraper
- **Multi-Source Torrent Indexer**: High-speed scraper with health indicators (seeders, leechers, file size, and 4K/1080p/720p quality tags).
- **One-Click Magnet Launch**: Open magnets directly in your preferred torrent client or share `.torrent` files.
- **Seamless Context Navigation**: Smart origin tracking that returns you directly to the exact movie details page.

### 🔔 6. Smart Background Notifications
- Periodic background engine for personalized recommendations and release alerts based on your saved watchlist.

---

## 🛠️ Tech Stack & Architecture

- **Core**: [React Native](https://reactnative.dev/) (0.86) & [Expo](https://expo.dev/) (SDK 57)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based typed navigation)
- **Animations & Gestures**: [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) (v4.5) & [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/)
- **Graphics & Glassmorphism**: `@shopify/react-native-skia`, `expo-blur`, `expo-linear-gradient`
- **Typography & Icons**: Google Sans Flex, `@expo/vector-icons`
- **State & Storage**: React Context + `@react-native-async-storage/async-storage`
- **Data Source**: [The Movie Database (TMDB) API](https://www.themoviedb.org/documentation/api)

---

## 🚀 Getting Started

### Prerequisites
Make sure you have the following installed:
- [Node.js](https://nodejs.org/) (v18.x or v20.x recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo-cli eas-cli`)
- [Android Studio](https://developer.android.com/studio) (for Android Emulator) or a physical Android device with [Expo Go](https://expo.dev/go)

---

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/fozzoi/Watcher.git
   cd Watcher
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory (or configure via `app.json`):
   ```env
   # TMDB API Key (Required for movie metadata)
   EXPO_PUBLIC_TMDB_API_KEY=your_tmdb_api_key_here
   ```

4. **Start the Development Server**:
   ```bash
   npx expo start
   ```

5. **Run on Device / Emulator**:
   - Press **`a`** in the terminal to open the Android emulator.
   - Press **`w`** for web preview.
   - Scan the terminal QR code with the **Expo Go** app on your physical device.

---

## 📦 Building for Production

### Build an Android APK using EAS:
```bash
# 1. Login to Expo Application Services
npx eas login

# 2. Configure project if not already done
npx eas build:configure

# 3. Trigger an APK build
npx eas build --platform android --profile production
```

### Over-The-Air (OTA) Updates:
Push instant code and style updates to all installed apps without rebuilding the binary:
```bash
npx eas update --platform android --branch production --environment production --message "your update message"
```

---

## 📁 Project Structure

```
Watcher/
├── app/                      # Expo Router File-Based Navigation
│   ├── (tabs)/               # Bottom Tab Screens (Explore, Watchlist, Search, AI Chat)
│   │   ├── _layout.tsx       # Custom Animated Glass Tab Bar
│   │   ├── index.tsx         # Explore Feed & Personalized Carousels
│   │   ├── watchlist.tsx     # Watchlist, Saved Collections & Artists
│   │   ├── search.tsx        # Integrated Torrent Search Engine
│   │   └── aichat.tsx        # Conversational AI Assistant
│   ├── movie/[id].tsx        # Movie & TV Details Screen (Lens, Cast, Media Player)
│   ├── cast/[id].tsx         # Actor/Director Profile & Filmography
│   ├── collection/[id].tsx   # Movie Franchise & Collection View
│   ├── player.tsx            # Fullscreen High-Performance Video Player
│   ├── onboarding.tsx        # First-Time User Preferences Onboarding
│   └── _layout.tsx           # App Root Layout & Theme Configuration
├── src/
│   ├── components/           # Reusable UI Components & Sections
│   │   ├── aichat/           # Markdown Text, AI Lists & Comparison Tables
│   │   ├── explore/          # HeroSection, CapsuleIndicator, GenreFilter
│   │   ├── movie/            # MovieChatSection (Contextual AI Companion)
│   │   └── shared/           # ParallaxCarousel, MovieCard, MediaCarousel
│   ├── notifications.ts      # Background Fetch & Smart Reminders
│   ├── tmdb.ts               # TMDB API Client & Dynamic Feed Logic
│   ├── Scraper.ts            # High-Speed Torrent Search Engine
│   └── userPreferences.ts    # Local Storage & Personalization Config
├── assets/                   # Fonts, Icons & Splash Screen Assets
└── eas.json                  # EAS Build & Update Configuration Profiles
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to open an issue or submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

<div align="center">

Made with ❤️ for cinema enthusiasts worldwide.

</div>
