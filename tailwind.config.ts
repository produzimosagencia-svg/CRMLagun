import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: 'calc(var(--spacing) * 4)',
  		screens: {
  			sm: '40rem',
  			md: '48rem',
  			lg: '64rem',
  			xl: '80rem',
  			'2xl': '96rem'
  		}
  	},
  	extend: {
  		fontFamily: {
  			display: [
  				'Fraunces',
  				'ui-serif',
  				'Georgia',
  				'serif'
  			],
  			sans: [
  				'Instrument Sans',
  				'ui-sans-serif',
  				'system-ui',
  				'-apple-system',
  				'Segoe UI',
  				'Roboto',
  				'Arial',
  				'sans-serif'
  			],
  			serif: [
  				'Fraunces',
  				'ui-serif',
  				'Georgia',
  				'serif'
  			],
  			mono: [
  				'IBM Plex Mono',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Consolas',
  				'monospace'
  			]
  		},
  		colors: {
  			// Rampa neutra quente do sistema — substitui o gray frio/azulado do Tailwind
  			gray: {
  				50: '#FAFAF7',
  				100: '#F2F0EA',
  				200: '#E7E4DC',
  				300: '#D9D5CA',
  				400: '#A8A294',
  				500: '#8A857B',
  				600: '#6F6A5E',
  				700: '#4E4A42',
  				800: '#2A2822',
  				900: '#1A1916',
  				950: '#121110'
  			},
  			slate: {
  				50: '#FAFAF7',
  				100: '#F2F0EA',
  				200: '#E7E4DC',
  				300: '#D9D5CA',
  				400: '#A8A294',
  				500: '#8A857B',
  				600: '#6F6A5E',
  				700: '#4E4A42',
  				800: '#2A2822',
  				900: '#1A1916',
  				950: '#121110'
  			},
  			// Rampa latão/ouro da marca — substitui os acentos roxo/azul genéricos
  			purple: {
  				50: '#FBF7EC',
  				100: '#F5EDD5',
  				200: '#EBDCAC',
  				300: '#E8C766',
  				400: '#D9B14E',
  				500: '#B98F35',
  				600: '#9A7B2D',
  				700: '#7C6224',
  				800: '#5C491C',
  				900: '#3E3113',
  				950: '#251D0B'
  			},
  			indigo: {
  				50: '#FBF7EC',
  				100: '#F5EDD5',
  				200: '#EBDCAC',
  				300: '#E8C766',
  				400: '#D9B14E',
  				500: '#B98F35',
  				600: '#9A7B2D',
  				700: '#7C6224',
  				800: '#5C491C',
  				900: '#3E3113',
  				950: '#251D0B'
  			},
  			violet: {
  				50: '#FBF7EC',
  				100: '#F5EDD5',
  				200: '#EBDCAC',
  				300: '#E8C766',
  				400: '#D9B14E',
  				500: '#B98F35',
  				600: '#9A7B2D',
  				700: '#7C6224',
  				800: '#5C491C',
  				900: '#3E3113',
  				950: '#251D0B'
  			},
  			blue: {
  				50: '#FBF7EC',
  				100: '#F5EDD5',
  				200: '#EBDCAC',
  				300: '#E8C766',
  				400: '#D9B14E',
  				500: '#B98F35',
  				600: '#9A7B2D',
  				700: '#7C6224',
  				800: '#5C491C',
  				900: '#3E3113',
  				950: '#251D0B'
  			},
  			sky: {
  				50: '#FBF7EC',
  				100: '#F5EDD5',
  				200: '#EBDCAC',
  				300: '#E8C766',
  				400: '#D9B14E',
  				500: '#B98F35',
  				600: '#9A7B2D',
  				700: '#7C6224',
  				800: '#5C491C',
  				900: '#3E3113',
  				950: '#251D0B'
  			},
  			cyan: {
  				50: '#FBF7EC',
  				100: '#F5EDD5',
  				200: '#EBDCAC',
  				300: '#E8C766',
  				400: '#D9B14E',
  				500: '#B98F35',
  				600: '#9A7B2D',
  				700: '#7C6224',
  				800: '#5C491C',
  				900: '#3E3113',
  				950: '#251D0B'
  			},
  			fuchsia: {
  				50: '#FBF7EC',
  				100: '#F5EDD5',
  				200: '#EBDCAC',
  				300: '#E8C766',
  				400: '#D9B14E',
  				500: '#B98F35',
  				600: '#9A7B2D',
  				700: '#7C6224',
  				800: '#5C491C',
  				900: '#3E3113',
  				950: '#251D0B'
  			},
  			brand: 'var(--brand)',
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)',
  				blue: 'var(--accent-blue)',
  				emerald: 'var(--accent-emerald)',
  				purple: 'var(--accent-purple)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
