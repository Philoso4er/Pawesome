import React, { useState } from 'react';
import { Search, ShoppingBag, Tag, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { findPetDeals } from '../services/gemini';
import { ShoppingItem, Coupon } from '../types';

export default function PetShopping() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ items: ShoppingItem[], coupons: Coupon[], summary: string } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const data = await findPetDeals(query);
      setResults(data);
    } catch (error) {
      console.error("Failed to find deals", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8 pb-24">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center justify-center gap-2">
          <ShoppingBag className="w-8 h-8 text-emerald-600" />
          Pawesome Shopping
        </h1>
        <p className="text-slate-600">Find the best deals and discounts for your pet's needs</p>
      </div>

      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for pet food, toys, accessories..."
          className="w-full pl-12 pr-24 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-emerald-600 text-white px-6 py-2 rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Find Deals
        </button>
      </form>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 space-y-4"
          >
            <div className="relative">
              <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
              <ShoppingBag className="absolute inset-0 m-auto w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-slate-500 font-medium animate-pulse">Searching for the best deals across the web...</p>
          </motion.div>
        ) : results ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* AI Summary */}
            <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
              <h2 className="text-emerald-900 font-semibold flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5" />
                AI Deal Analysis
              </h2>
              <p className="text-emerald-800 leading-relaxed">{results.summary}</p>
            </div>

            {/* Coupons Section */}
            {results.coupons.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Tag className="w-6 h-6 text-orange-500" />
                  Active Coupons & Offers
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {results.coupons.map((coupon, idx) => (
                    <div key={idx} className="bg-white border-2 border-dashed border-orange-200 p-4 rounded-xl flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-lg font-mono font-bold text-lg">
                            {coupon.code}
                          </span>
                          <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">{coupon.source}</span>
                        </div>
                        <p className="text-slate-700 font-medium">{coupon.description}</p>
                      </div>
                      {coupon.expiry && (
                        <p className="text-xs text-slate-500 mt-2 italic">Expires: {coupon.expiry}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products Section */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-emerald-600" />
                Best Prices Found
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {results.items.map((item, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                    {item.imageUrl && (
                      <div className="aspect-video relative overflow-hidden bg-slate-100">
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h3 className="font-bold text-slate-900 line-clamp-2">{item.title}</h3>
                        <span className="text-emerald-600 font-bold text-lg whitespace-nowrap">{item.price}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
                        <span>{item.source}</span>
                        {item.rating && (
                          <>
                            <span>•</span>
                            <span className="text-orange-500">★ {item.rating}</span>
                          </>
                        )}
                      </div>
                      {item.dealInfo && (
                        <div className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-1 rounded mb-4 self-start">
                          {item.dealInfo}
                        </div>
                      )}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-auto w-full bg-slate-900 text-white py-2 rounded-xl font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                      >
                        View Deal
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="py-24 text-center space-y-4">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
              <ShoppingBag className="w-10 h-10 text-slate-300" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-900">Start Shopping</h3>
              <p className="text-slate-500 max-w-xs mx-auto">
                Search for any pet item and I'll find the best deals and coupons for you.
              </p>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
