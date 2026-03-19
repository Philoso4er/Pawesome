import React from 'react';
import { PawPrint, MessageSquare, Users, Heart, GraduationCap, Settings, Home, PlusCircle, MessageCircle, HelpCircle, ShoppingBag } from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const navItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'chat', icon: MessageSquare, label: 'Consult' },
    { id: 'forum', icon: MessageCircle, label: 'Forum' },
    { id: 'qa', icon: HelpCircle, label: 'Q&A' },
    { id: 'shop', icon: ShoppingBag, label: 'Shop' },
    { id: 'social', icon: Users, label: 'Social' },
    { id: 'health', icon: Heart, label: 'Health' },
    { id: 'training', icon: GraduationCap, label: 'Train' },
    { id: 'profile', icon: Settings, label: 'Profile' },
  ];

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#F0EBE6] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#5A5A40] rounded-xl flex items-center justify-center text-white">
              <PawPrint size={24} />
            </div>
            <h1 className="text-2xl font-serif font-bold tracking-tight text-[#5A5A40]">Pawesome</h1>
          </div>
          <button className="p-2 hover:bg-[#F5F2ED] rounded-full transition-colors">
            <PlusCircle className="text-[#5A5A40]" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 pb-24">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#F0EBE6] px-6 py-3 md:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-around">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all duration-200",
                activeTab === item.id ? "text-[#5A5A40]" : "text-[#A19B95] hover:text-[#7C7670]"
              )}
            >
              <item.icon size={24} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              <span className="text-[10px] uppercase tracking-wider font-semibold">{item.label}</span>
              {activeTab === item.id && (
                <div className="w-1 h-1 bg-[#5A5A40] rounded-full mt-0.5" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
