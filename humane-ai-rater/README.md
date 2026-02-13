# Humane AI Rater 🌱

A Chrome extension that lets users rate AI chatbot interactions (ChatGPT, Claude) with one tap, creating crowdsourced humaneness data with strong privacy and anti-spoofing protections.

## Features

- **One-tap rating** - Simple thumbs up/down to rate AI responses
- **Privacy-first** - Never collects conversations or personal data
- **Anti-spoofing** - 5-layer defense against manipulation
- **Live leaderboard** - See which AI platforms are most humane
- **Cross-platform** - Works with ChatGPT and Claude

## Installation

### Chrome Extension (Development)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the `extension/` folder
5. The extension icon should appear in your toolbar

### Firebase Backend

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable Firestore Database
3. Update `extension/background.js` with your Firebase config
4. Deploy security rules:
   ```bash
   cd firebase
   firebase deploy --only firestore:rules
   ```
5. Deploy Cloud Functions:
   ```bash
   cd firebase/functions
   npm install
   firebase deploy --only functions
   ```

## Project Structure

```
humane-ai-rater/
├── extension/
│   ├── manifest.json          # Chrome Manifest V3
│   ├── background.js          # Service worker
│   ├── content/
│   │   ├── injector.js        # Detects AI responses, injects UI
│   │   └── styles.css         # Rating UI styles
│   ├── popup/
│   │   ├── popup.html         # Extension popup (leaderboard)
│   │   ├── popup.js
│   │   ├── popup.css
│   │   └── welcome.html       # Privacy notice on install
│   └── icons/                 # Extension icons
├── firebase/
│   ├── firestore.rules        # Security rules
│   ├── firestore.indexes.json # Database indexes
│   ├── firebase.json          # Firebase config
│   └── functions/             # Cloud functions (anti-spam)
├── web/                       # Public leaderboard page
│   └── index.html
└── README.md
```

## Privacy Architecture

### What We Collect (Minimal)

- Your thumbs up/down rating
- Which AI platform (ChatGPT, Claude)
- Anonymous device fingerprint (for anti-spam)
- Optional tags you select

### What We NEVER Collect

- Conversation text or prompts
- Personal identifiable information
- Browsing history outside AI sites
- Cookies or tracking data

## Anti-Spoofing Defenses

1. **Device Fingerprinting** - Privacy-preserving hash to detect duplicates
2. **Rate Limiting** - Max 50 ratings per device per day
3. **Behavioral Signals** - Detects bots (no mouse, instant clicks)
4. **Anomaly Detection** - Flags uniform ratings, burst activity
5. **Trust Scoring** - Weights ratings by authenticity signals

## Usage

1. Visit [chat.openai.com](https://chat.openai.com) or [claude.ai](https://claude.ai)
2. Have a conversation with the AI
3. After each response, you'll see a subtle rating UI
4. Click 👍 if the response was helpful and respectful
5. Click 👎 if it wasted your time or felt manipulative
6. Click the extension icon to see the community leaderboard

## Development

### Prerequisites

- Node.js 18+
- Firebase CLI (`npm install -g firebase-tools`)
- Chrome browser

### Local Development

1. Load extension in Chrome (developer mode)
2. Run Firebase emulators:
   ```bash
   cd firebase
   firebase emulators:start
   ```
3. Update `background.js` to point to local emulator

### Testing

- Manual testing checklist in the plan document
- Test on both ChatGPT and Claude
- Verify rate limiting works (try 51+ ratings)
- Test anti-spoofing (rapid clicks, background tabs)

## Configuration

### Firebase Config

Update these values in `extension/background.js`:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com"
};
```

### Adding New Platforms

Edit `extension/content/injector.js` to add new platform configurations:

```javascript
const PLATFORMS = {
  newplatform: {
    hosts: ['newplatform.com'],
    responseSelector: '[data-response]',
    containerSelector: '.response-content',
    streamingIndicator: '.loading',
    name: 'New Platform'
  }
};
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file

## Acknowledgments

- Inspired by the humane technology movement
- Built for creating more respectful AI experiences
