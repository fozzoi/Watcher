// Jest stand-in for the native connectivity module. Tests drive offline
// behaviour by flipping `__setNetInfoState` / calling the registered listener.
let handler = null;

const state = {
  type: 'wifi',
  isConnected: true,
  isInternetReachable: true,
  isWifiEnabled: true,
  details: null,
};

const NetInfo = {
  addEventListener: (cb) => {
    handler = cb;
    return () => {
      handler = null;
    };
  },
  fetch: async () => state,
  configure: () => {},
  useNetInfo: () => state,
  refresh: async () => state,
};

NetInfo.__setState = (patch) => {
  Object.assign(state, patch);
  if (handler) handler({ ...state });
};

NetInfo.__reset = () => {
  handler = null;
  Object.assign(state, { isConnected: true, isInternetReachable: true });
};

module.exports = {
  __esModule: true,
  default: NetInfo,
  ...NetInfo,
  NetInfoStateType: {},
};
