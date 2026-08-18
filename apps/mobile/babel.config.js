module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 draait op react-native-worklets; deze plugin moet als
    // laatste staan.
    plugins: ['react-native-worklets/plugin'],
  };
};
