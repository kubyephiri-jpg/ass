import { Link } from 'wouter';
import { ArrowUpRight } from 'lucide-react';

export function StoreFooter() {
  return (
    <footer className="bg-[#1b1915] text-[#e9dfcd]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-9 px-5 py-11 sm:px-8 md:flex-row md:items-end md:justify-between lg:px-12">
        <div className="max-w-sm">
          <p className="serif text-2xl">A little care in every choice.</p>
          <p className="mt-2 text-sm leading-6 text-[#aaa08f]">Good things, picked with care and priced with people in mind.</p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/shop" className="text-[#d6cebf] hover:text-[#e6bd62]" data-testid="footer-link-home">Shop</Link>
          <Link href="/dashboard" className="flex items-center gap-1 text-[#d6cebf] hover:text-[#e6bd62]" data-testid="footer-link-owner">Owner desk <ArrowUpRight size={13} /></Link>
          <span className="text-xs text-[#82796a]">© {new Date().getFullYear()} Jeffchilu’s</span>
        </div>
      </div>
    </footer>
  );
}
