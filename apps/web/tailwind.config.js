/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"'],
        mono: ['SFMono-Regular', 'Consolas', '"Liberation Mono"', 'Menlo', 'Courier', 'monospace'],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            fontSize: '16px',
            lineHeight: '1.5',
            color: '#1f2328',
            'h1': { fontSize: '2em', fontWeight: '600', paddingBottom: '0.3em', borderBottom: '1px solid #d1d9e0b3', marginTop: '24px', marginBottom: '16px' },
            'h2': { fontSize: '1.5em', fontWeight: '600', paddingBottom: '0.3em', borderBottom: '1px solid #d1d9e0b3', marginTop: '24px', marginBottom: '16px' },
            'h3': { fontSize: '1.25em', fontWeight: '600', marginTop: '24px', marginBottom: '16px' },
            'h4': { fontSize: '1em', fontWeight: '600', marginTop: '24px', marginBottom: '16px' },
            'h5': { fontSize: '0.875em', fontWeight: '600', marginTop: '24px', marginBottom: '16px' },
            'h6': { fontSize: '0.85em', fontWeight: '600', color: '#656d76', marginTop: '24px', marginBottom: '16px' },
            'code': { fontSize: '85%', padding: '0.2em 0.4em', borderRadius: '6px', backgroundColor: '#eff1f3' },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            'pre': { fontSize: '85%', lineHeight: '1.45', borderRadius: '6px', padding: '16px', backgroundColor: '#f6f8fa' },
            'pre code': { fontSize: 'inherit', backgroundColor: 'transparent', padding: '0' },
            'a': { color: '#0969da', textDecoration: 'none', fontWeight: 'inherit' },
            'a:hover': { textDecoration: 'underline' },
            'blockquote': { color: '#656d76', borderLeftColor: '#d0d7de', borderLeftWidth: '0.25em', padding: '0 1em', marginTop: '0', marginBottom: '16px' },
            'hr': { borderColor: '#d1d9e0b3', borderTopWidth: '4px', margin: '24px 0' },
            'table': { borderCollapse: 'collapse' },
            'th': { fontWeight: '600', padding: '6px 13px', border: '1px solid #d0d7de' },
            'td': { padding: '6px 13px', border: '1px solid #d0d7de' },
            'img': { maxWidth: '100%' },
          },
        },
        invert: {
          css: {
            color: '#e6edf3',
            'h1, h2': { borderBottomColor: '#3d444db3' },
            'h6': { color: '#9198a1' },
            'code': { backgroundColor: '#343942' },
            'pre': { backgroundColor: '#161b22' },
            'a': { color: '#4493f8' },
            'blockquote': { color: '#9198a1', borderLeftColor: '#3d444d' },
            'hr': { borderColor: '#3d444db3' },
            'th, td': { borderColor: '#3d444d' },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
