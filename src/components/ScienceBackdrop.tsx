export default function ScienceBackdrop() {
  return (
    <div aria-hidden="true" className="science-backdrop">
      <div className="science-backdrop__mesh" />
      <div className="science-backdrop__grid" />
      <div className="science-backdrop__glow science-backdrop__glow--bio" />
      <div className="science-backdrop__glow science-backdrop__glow--chem" />
      <div className="science-backdrop__glow science-backdrop__glow--phys" />
      <div className="science-backdrop__glow science-backdrop__glow--earth" />

      <svg className="science-motif science-motif--bio" viewBox="0 0 180 180" fill="none">
        <path d="M70 136c-4-29 4-54 27-75 16-14 35-23 58-26-5 27-16 48-33 64-14 14-31 26-52 37" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M69 135c8-21 20-38 37-53 11-10 24-18 39-24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="4 7" />
        <circle cx="64" cy="141" r="8" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="51" cy="122" r="4" fill="currentColor" />
        <circle cx="85" cy="116" r="5" fill="currentColor" />
      </svg>

      <svg className="science-motif science-motif--chem" viewBox="0 0 180 180" fill="none">
        <path d="M70 44h40l20 34-20 34H70L50 78z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M70 44l20 34-20 34" stroke="currentColor" strokeWidth="1.4" strokeDasharray="5 6" />
        <path d="M110 44L90 78l20 34" stroke="currentColor" strokeWidth="1.4" strokeDasharray="5 6" />
        <circle cx="50" cy="78" r="10" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="130" cy="78" r="10" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="90" cy="28" r="8" fill="currentColor" />
        <path d="M90 36v22M58 64l16 9M122 64l-16 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>

      <svg className="science-motif science-motif--phys" viewBox="0 0 180 180" fill="none">
        <ellipse cx="92" cy="88" rx="54" ry="24" stroke="currentColor" strokeWidth="1.8" />
        <ellipse cx="92" cy="88" rx="54" ry="24" stroke="currentColor" strokeWidth="1.8" transform="rotate(58 92 88)" />
        <ellipse cx="92" cy="88" rx="54" ry="24" stroke="currentColor" strokeWidth="1.8" transform="rotate(-58 92 88)" />
        <circle cx="92" cy="88" r="7" fill="currentColor" />
        <circle cx="140" cy="88" r="4.5" fill="currentColor" />
        <path d="M24 136c11-15 21-23 32-23s21 8 32 23 21 23 32 23 21-8 32-23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 8" />
      </svg>

      <svg className="science-motif science-motif--earth" viewBox="0 0 180 180" fill="none">
        <circle cx="92" cy="88" r="42" stroke="currentColor" strokeWidth="2.2" />
        <path d="M58 80c9 0 15-12 24-12 12 0 14 18 28 18 10 0 13-8 24-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M54 102c11 0 14 8 24 8 14 0 18-20 30-20 9 0 13 10 23 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M34 138c20-8 42-8 62 0s42 8 62 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M42 150c17-7 35-7 52 0s35 7 52 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="4 7" />
        <circle cx="122" cy="54" r="6" fill="currentColor" />
      </svg>
    </div>
  )
}
