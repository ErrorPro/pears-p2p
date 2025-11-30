# Bare on Expo

Example of embedding Bare in an Expo application using <https://github.com/holepunchto/react-native-bare-kit>.

## Usage

Start by installing the dependencies:

```sh
npm install
```

When finished, you can run the app on either iOS or Android.

### iOS

```sh
npm run ios
```

### Android

```sh
npm run android
```

## License

Apache-2.0

### What was done and what still needs to be done:

1. Backend: Pears P2P basic setup. More work needs to be done to cover all use-cases of p2p connection (retry mechanisms, error handling, optimal synchronization, enriched RPC statuses for better UI/UX).
2. Backend: Restructure the BE to be more modular and resilient, extract common logic and utils, cover with tests.
3. Front-end: UI and UX are basic, no error handling, some feedback is missing (sync messages, connecting to a room, discovery of other peers/rooms).
4. Front-end: Current solution uses provider as the storage & communication layer as a basic example. For a more robust use case, a proper store + side-effect handlers are needed.
5. Both: better devex – eslint rules, prettier config, absolute imports, husky, ci/cd and etc.
6. Both: Lack of unit & e2e tests.

The primary task was to make the p2p work using Pears components (swarm & core).
