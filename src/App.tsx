import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ChatInterface from './components/ChatInterface';
import LiveConsultation from './components/LiveConsultation';
import PetProfiles from './components/PetProfiles';
import HealthDiary from './components/HealthDiary';
import TrainingModule from './components/TrainingModule';
import SocialHub from './components/SocialHub';
import CommunityForum from './components/CommunityForum';
import ExpertQA from './components/ExpertQA';
import PetShopping from './components/PetShopping';
import FeedingTracker from './components/FeedingTracker';
import SitterHandoffSheet from './components/SitterHandoffSheet';
import SeniorJournal from './components/SeniorJournal';
import { PawPrint, Heart, Zap, MapPin, Loader2, LogIn, GraduationCap, Users, Settings, MessageCircle, HelpCircle, ShoppingBag, UtensilsCrossed, ClipboardList, BookHeart } from 'lucide-react';
import { getPetAdvice } from './services/gemini';
import { useFirebase } from './FirebaseProvider';
import ProPaywall, { ProPlans } from './components/ProPaywall';
import { getMe, openPaywall } from './lib/billing';

const FREE_NEARBY = [
  { title: 'Vets near me', uri: 'https://www.google.com/maps/search/vets+near+me' },
  { title: 'Emergency vets near me', uri: 'https://www.google.com/maps/search/emergency+vet+near+me' },
  { title: 'Pet shops near me', uri: 'https://www.google.com/maps/search/pet+shop+near+me' },
  { title: 'Dog groomers near me', uri: 'https://www.google.com/maps/search/dog+groomer+near+me' },
  { title: 'Dog parks near me', uri: 'https://www.google.com/maps/search/dog+park+near+me' },
];

export default function App() {
  const { user, loading, signIn } = useFirebase();
  const [activeTab, setActiveTab] = useState('home');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [nearbyServices, setNearbyServices] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Returning from Stripe Checkout: refresh entitlement (Stripe search can lag ~1 min).
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get('checkout');
    if (!status) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (status !== 'success') return;
    const kind = params.get('kind');
    setNotice(kind === 'consult' ? 'Payment received! Your consultation credit is being added…' : 'Welcome to Pawesome Pro! Activating…');
    let tries = 0;
    const tick = async () => {
      const me = await getMe(true);
      if ((kind === 'consult' ? me.credits > 0 : me.pro) || ++tries > 8) {
        setNotice(kind === 'consult' ? 'Your consultation is ready: open Pro → Start session.' : "You're Pro! All AI features are unlocked.");
        setTimeout(() => setNotice(null), 6000);
      } else setTimeout(tick, 8000);
    };
    tick();
  }, [user]);

  const startLive = async () => {
    const me = await getMe(true);
    if (me.credits > 0) setIsLiveActive(true);
    else openPaywall('consult');
  };

  useEffect(() => {
    if (activeTab === 'home' && user) {
      fetchNearbyServices();
    }
  }, [activeTab, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-[#5A5A40] rounded-2xl flex items-center justify-center text-white animate-bounce">
            <PawPrint size={32} />
          </div>
          <p className="text-[#5A5A40] font-serif font-bold text-xl">Pawesome</p>
          <Loader2 className="animate-spin text-[#A19B95]" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-8 text-center bg-white p-10 rounded-[40px] shadow-xl border border-[#F0EBE6]">
          <div className="w-20 h-20 bg-[#5A5A40] rounded-3xl flex items-center justify-center text-white mx-auto shadow-lg">
            <PawPrint size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-serif font-bold text-[#5A5A40]">Welcome to Pawesome</h1>
            <p className="text-[#7C7670]">The only app a pet owner should ever need. Expert AI advice, live consultations, and more.</p>
          </div>
          <button
            onClick={signIn}
            className="w-full flex items-center justify-center gap-3 bg-[#5A5A40] text-white py-4 rounded-2xl font-bold text-lg hover:shadow-xl transition-all active:scale-95"
          >
            <LogIn size={24} />
            Sign in with Google
          </button>
          <p className="text-xs text-[#A19B95]">By signing in, you agree to our terms and conditions.</p>
        </div>
      </div>
    );
  }

  const fetchNearbyServices = async () => {
    const me = await getMe();
    if (!me.pro) {
      setNearbyServices(FREE_NEARBY); // free tier: no AI cost
      return;
    }
    setIsSearching(true);
    try {
      let locationPrompt = "Find pet stores, veterinarians, and dog parks nearby.";
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          const result = await getPetAdvice(`Find pet stores, veterinarians, and dog parks near coordinates ${latitude}, ${longitude}.`);
          const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (chunks) {
            setNearbyServices(chunks.map((c: any) => c.web || c.maps).filter(Boolean));
          }
        });
      } else {
        const result = await getPetAdvice(locationPrompt);
        const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
          setNearbyServices(chunks.map((c: any) => c.web || c.maps).filter(Boolean));
        }
      }
    } catch (error) {
      console.error("Failed to fetch services:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const renderContent = () => {
    if (isLiveActive) return <LiveConsultation onEnd={() => setIsLiveActive(false)} />;

    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <section className="relative overflow-hidden rounded-[32px] bg-[#5A5A40] p-8 text-white shadow-xl">
              <div className="relative z-10 space-y-4 max-w-md">
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                  <Zap size={14} className="text-yellow-400" />
                  AI Powered Pet Care
                </div>
                <h2 className="text-4xl font-serif font-bold leading-tight">
                  Everything your pet needs, in one place.
                </h2>
                <p className="text-white/80 text-sm leading-relaxed">
                  Get instant expert advice, find local services, and manage your pet's health with Pawesome AI.
                </p>
                <button
                  onClick={startLive}
                  className="bg-white text-[#5A5A40] px-6 py-3 rounded-full font-semibold text-sm hover:shadow-lg transition-all active:scale-95"
                >
                  Book a Live Consultation
                </button>
                <p className="text-[11px] text-white/60 max-w-sm">AI guidance, not a substitute for a vet. In an emergency, call your vet.</p>
              </div>
              <div className="absolute right-[-20px] bottom-[-20px] opacity-20">
                <PawPrint size={240} strokeWidth={1} />
              </div>
            </section>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[
                { label: 'Forum', icon: MessageCircle, color: 'bg-orange-50 text-orange-600', tab: 'forum' },
                { label: 'Expert Q&A', icon: HelpCircle, color: 'bg-indigo-50 text-indigo-600', tab: 'qa' },
                { label: 'Shop', icon: ShoppingBag, color: 'bg-emerald-50 text-emerald-600', tab: 'shop' },
                { label: 'Social Hub', icon: Users, color: 'bg-blue-50 text-blue-600', tab: 'social' },
                { label: 'Health Diary', icon: Heart, color: 'bg-rose-50 text-rose-600', tab: 'health' },
                { label: 'Training', icon: GraduationCap, color: 'bg-purple-50 text-purple-600', tab: 'training' },
                { label: 'Profile', icon: Settings, color: 'bg-slate-50 text-slate-600', tab: 'profile' },
                { label: 'Feeding', icon: UtensilsCrossed, color: 'bg-yellow-50 text-yellow-600', tab: 'feeding' },
                { label: 'Sitter Sheet', icon: ClipboardList, color: 'bg-teal-50 text-teal-600', tab: 'sitter' },
                { label: 'Senior Journal', icon: BookHeart, color: 'bg-pink-50 text-pink-600', tab: 'senior' },
              ].map((action, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(action.tab)}
                  className="flex flex-col items-center gap-3 p-6 bg-white rounded-3xl border border-[#F0EBE6] hover:border-[#5A5A40] transition-all group"
                >
                  <div className={`w-12 h-12 ${action.color} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <action.icon size={24} />
                  </div>
                  <span className="text-sm font-semibold text-[#5A5A40]">{action.label}</span>
                </button>
              ))}
            </div>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-serif font-bold text-[#5A5A40]">Nearby Services</h3>
                <button onClick={fetchNearbyServices} className="text-xs font-semibold uppercase tracking-widest text-[#A19B95] hover:text-[#5A5A40]">
                  Refresh
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {isSearching ? (
                  <div className="flex items-center gap-2 text-[#A19B95] py-4">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Searching...</span>
                  </div>
                ) : nearbyServices.length > 0 ? (
                  nearbyServices.map((service, i) => (
                    <a key={i} href={service.uri} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 w-64 p-4 bg-white rounded-3xl border border-[#F0EBE6] hover:border-[#5A5A40] transition-all">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 bg-[#F5F2ED] rounded-lg flex items-center justify-center text-[#5A5A40]">
                          <MapPin size={16} />
                        </div>
                        <h4 className="font-bold text-[#5A5A40] text-sm truncate">{service.title}</h4>
                      </div>
                      <p className="text-[10px] text-[#A19B95] uppercase tracking-widest">View on Maps</p>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-[#A19B95]">Click refresh to find services near you.</p>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xl font-serif font-bold text-[#5A5A40]">Daily Pet Tips</h3>
              <div className="grid gap-4">
                {[
                  { title: "Hydration is Key", desc: "Ensure your pet has fresh water at all times, especially during summer.", tag: "Health" },
                  { title: "Mental Stimulation", desc: "Try puzzle toys to keep your dog's mind sharp and prevent boredom.", tag: "Behavior" },
                ].map((tip, i) => (
                  <div key={i} className="p-5 bg-white rounded-3xl border border-[#F0EBE6] flex gap-4 items-start">
                    <div className="w-2 h-12 bg-[#5A5A40] rounded-full opacity-20" />
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#A19B95]">{tip.tag}</span>
                      <h4 className="font-bold text-[#5A5A40]">{tip.title}</h4>
                      <p className="text-sm text-[#7C7670]">{tip.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        );
      case 'chat':
        return <ChatInterface />;
      case 'forum':
        return <CommunityForum />;
      case 'qa':
        return <ExpertQA />;
      case 'shop':
        return <PetShopping />;
      case 'social':
        return <SocialHub />;
      case 'health':
        return <HealthDiary />;
      case 'training':
        return <TrainingModule />;
      case 'profile':
        return <PetProfiles />;
      case 'feeding':
        return <FeedingTracker />;
      case 'sitter':
        return <SitterHandoffSheet />;
      case 'senior':
        return <SeniorJournal />;
      case 'pro':
        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-serif font-bold text-[#5A5A40] text-center">Pawesome Pro & Consultations</h2>
            <ProPlans onStartLive={() => setIsLiveActive(true)} />
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-[60vh] text-[#A19B95]">
            Coming Soon
          </div>
        );
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <ErrorBoundary>
        {notice && (
          <div className="mb-6 rounded-2xl bg-[#5A5A40] text-white px-5 py-3 text-sm font-semibold text-center">{notice}</div>
        )}
        {renderContent()}
        <ProPaywall onStartLive={() => setIsLiveActive(true)} />
      </ErrorBoundary>
    </Layout>
  );
}
