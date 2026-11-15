export const logoUrl = `${import.meta.env.BASE_URL}favicon.svg?v=${__LOGO_VERSION__}`;

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return <img className={compact ? 'footer-seal' : 'brand-seal'} src={logoUrl} alt="شعار ثبات" width={208} height={224} />;
}
