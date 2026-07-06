export default {
  output: { file: 'dist/bundle.js' },
  // Build-time flag, not app runtime config.
  plugins: process.env.MINIFY ? ['minify'] : [],
};
