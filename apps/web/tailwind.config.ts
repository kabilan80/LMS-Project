import type { Config } from 'tailwindcss';

// Values copied from the CSS inside docs/design/*.html (the always-light ".frame" mockup).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1E2A5E', 2: '#2C3B80' },
        gold: { DEFAULT: '#F2A900', ink: '#241800' },
        page: '#F3F5FA',
        card: '#FFFFFF',
        line: { DEFAULT: '#E2E6EF', soft: '#EEF0F6' },
        ink: '#1B2233',
        muted: '#6A7388',
        success: '#1E9E6A',
        danger: '#D64545',
        // sidebar text colors
        side: { text: '#C9D0EE', group: '#8D98CF' },
        // pill backgrounds / text
        pill: {
          'ok-bg': '#E3F6EE',
          ok: '#12784F',
          'wa-bg': '#FFF1D6',
          wa: '#8A5600',
          'bad-bg': '#FBE4E4',
          bad: '#A62B2B',
          'in-bg': '#E6EAF8',
        },
        track: '#E9ECF4', // progress bar track
      },
      fontFamily: {
        heading: ['"Bricolage Grotesque"', 'Figtree', 'system-ui', 'sans-serif'],
        body: ['Figtree', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        base: ['12.5px', '1.45'], // mockup body size
        kpi: ['22px', '1.2'],
      },
      borderRadius: { card: '10px', ctl: '8px', nav: '7px' },
      spacing: { sidebar: '186px' },
      boxShadow: { drawer: '0 0 40px rgba(30,42,94,.25)' },
    },
  },
  plugins: [],
} satisfies Config;
