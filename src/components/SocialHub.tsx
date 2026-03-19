import React, { useState, useEffect } from 'react';
import { Users, MapPin, Calendar, Heart, MessageCircle, Share2, Plus, Image as ImageIcon, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, limit, updateDoc, doc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { SocialPost, Playdate, Pet } from '../types';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function SocialHub() {
  const { user, loading: authLoading } = useFirebase();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [playdates, setPlaydates] = useState<Playdate[]>([]);
  const [pets, setPets] = useState<Pet[]>([]);
  const [isAddingPost, setIsAddingPost] = useState(false);
  const [isAddingPlaydate, setIsAddingPlaydate] = useState(false);
  const [activeTab, setActiveTab] = useState<'feed' | 'playdates'>('feed');

  const [newPost, setNewPost] = useState({ content: '', petId: '' });
  const [newPlaydate, setNewPlaydate] = useState({ hostPetId: '', location: '', dateTime: '', notes: '' });

  useEffect(() => {
    if (authLoading || !user) return;

    // Fetch Pets
    const petsQuery = query(collection(db, 'users', user.uid, 'pets'));
    const unsubscribePets = onSnapshot(petsQuery, (snapshot) => {
      const petList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Pet[];
      setPets(petList);
      if (petList.length > 0) {
        setNewPost(prev => ({ ...prev, petId: petList[0].id }));
        setNewPlaydate(prev => ({ ...prev, hostPetId: petList[0].id }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/pets`);
    });

    // Fetch Posts
    const postsQuery = query(collection(db, 'socialPosts'), orderBy('timestamp', 'desc'), limit(20));
    const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SocialPost[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'socialPosts');
    });

    // Fetch Playdates
    const playdatesQuery = query(collection(db, 'playdates'), orderBy('dateTime', 'asc'));
    const unsubscribePlaydates = onSnapshot(playdatesQuery, (snapshot) => {
      setPlaydates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Playdate[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'playdates');
    });

    return () => {
      unsubscribePets();
      unsubscribePosts();
      unsubscribePlaydates();
    };
  }, [authLoading, user]);

  const handleCreatePost = async () => {
    if (!user || !newPost.content || !newPost.petId) return;
    try {
      await addDoc(collection(db, 'socialPosts'), {
        userId: user.uid,
        petId: newPost.petId,
        content: newPost.content,
        timestamp: serverTimestamp(),
        likes: [],
      });
      setIsAddingPost(false);
      setNewPost({ content: '', petId: pets[0]?.id || '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'socialPosts');
    }
  };

  const handleCreatePlaydate = async () => {
    if (!user || !newPlaydate.location || !newPlaydate.dateTime) return;
    try {
      await addDoc(collection(db, 'playdates'), {
        hostId: user.uid,
        hostPetId: newPlaydate.hostPetId,
        location: newPlaydate.location,
        dateTime: newPlaydate.dateTime,
        status: 'pending',
        notes: newPlaydate.notes,
      });
      setIsAddingPlaydate(false);
      setNewPlaydate({ hostPetId: pets[0]?.id || '', location: '', dateTime: '', notes: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'playdates');
    }
  };

  const toggleLike = async (postId: string, likes: string[]) => {
    if (!user) return;
    const postRef = doc(db, 'socialPosts', postId);
    const isLiked = likes.includes(user.uid);
    try {
      await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `socialPosts/${postId}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex bg-[#F5F2ED] p-1 rounded-full">
          <button 
            onClick={() => setActiveTab('feed')}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-bold transition-all",
              activeTab === 'feed' ? "bg-[#5A5A40] text-white shadow-md" : "text-[#A19B95]"
            )}
          >
            Feed
          </button>
          <button 
            onClick={() => setActiveTab('playdates')}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-bold transition-all",
              activeTab === 'playdates' ? "bg-[#5A5A40] text-white shadow-md" : "text-[#A19B95]"
            )}
          >
            Playdates
          </button>
        </div>
        <button 
          onClick={() => activeTab === 'feed' ? setIsAddingPost(true) : setIsAddingPlaydate(true)}
          className="bg-[#5A5A40] text-white p-3 rounded-full shadow-lg hover:scale-110 transition-transform"
        >
          <Plus size={24} />
        </button>
      </div>

      {isAddingPost && (
        <div className="p-6 bg-white rounded-[32px] border-2 border-[#5A5A40]/20 space-y-4 shadow-xl animate-in zoom-in-95 duration-200">
          <h3 className="font-serif font-bold text-[#5A5A40]">Share a Moment</h3>
          <div className="space-y-4">
            <select 
              value={newPost.petId}
              onChange={e => setNewPost({...newPost, petId: e.target.value})}
              className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
            >
              {pets.map(pet => (
                <option key={pet.id} value={pet.id}>{pet.name}</option>
              ))}
            </select>
            <textarea 
              value={newPost.content}
              onChange={e => setNewPost({...newPost, content: e.target.value})}
              className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm min-h-[100px]"
              placeholder="What's your pet up to?"
            />
            <div className="flex gap-2">
              <button onClick={handleCreatePost} className="flex-1 bg-[#5A5A40] text-white py-3 rounded-xl font-bold">Post</button>
              <button onClick={() => setIsAddingPost(false)} className="flex-1 bg-[#F5F2ED] text-[#5A5A40] py-3 rounded-xl font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isAddingPlaydate && (
        <div className="p-6 bg-white rounded-[32px] border-2 border-[#5A5A40]/20 space-y-4 shadow-xl animate-in zoom-in-95 duration-200">
          <h3 className="font-serif font-bold text-[#5A5A40]">Schedule a Playdate</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select 
              value={newPlaydate.hostPetId}
              onChange={e => setNewPlaydate({...newPlaydate, hostPetId: e.target.value})}
              className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
            >
              {pets.map(pet => (
                <option key={pet.id} value={pet.id}>{pet.name}</option>
              ))}
            </select>
            <input 
              type="text" 
              placeholder="Location (e.g. Central Park)"
              value={newPlaydate.location}
              onChange={e => setNewPlaydate({...newPlaydate, location: e.target.value})}
              className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
            />
            <input 
              type="datetime-local" 
              value={newPlaydate.dateTime}
              onChange={e => setNewPlaydate({...newPlaydate, dateTime: e.target.value})}
              className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
            />
          </div>
          <textarea 
            value={newPlaydate.notes}
            onChange={e => setNewPlaydate({...newPlaydate, notes: e.target.value})}
            className="w-full bg-[#FDFCFB] border-[#F0EBE6] rounded-xl text-sm"
            placeholder="Notes for other pet owners..."
          />
          <div className="flex gap-2">
            <button onClick={handleCreatePlaydate} className="flex-1 bg-[#5A5A40] text-white py-3 rounded-xl font-bold">Schedule</button>
            <button onClick={() => setIsAddingPlaydate(false)} className="flex-1 bg-[#F5F2ED] text-[#5A5A40] py-3 rounded-xl font-bold">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {activeTab === 'feed' ? (
          posts.map(post => (
            <div key={post.id} className="bg-white rounded-[32px] border border-[#F0EBE6] overflow-hidden hover:shadow-md transition-all">
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F5F2ED] rounded-full flex items-center justify-center text-[#5A5A40]">
                    <Users size={20} />
                  </div>
                  <div>
                    <h5 className="font-bold text-[#5A5A40] text-sm">Pet Owner</h5>
                    <p className="text-[10px] text-[#A19B95] uppercase tracking-widest">
                      {post.timestamp?.seconds ? format(new Date(post.timestamp.seconds * 1000), 'MMM dd, HH:mm') : 'Just now'}
                    </p>
                  </div>
                </div>
                <p className="text-[#7C7670]">{post.content}</p>
                <div className="flex items-center gap-6 pt-2 border-top border-[#F0EBE6]">
                  <button 
                    onClick={() => toggleLike(post.id, post.likes)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-bold transition-colors",
                      post.likes.includes(user?.uid || '') ? "text-red-500" : "text-[#A19B95] hover:text-[#5A5A40]"
                    )}
                  >
                    <Heart size={18} fill={post.likes.includes(user?.uid || '') ? "currentColor" : "none"} />
                    {post.likes.length}
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-bold text-[#A19B95] hover:text-[#5A5A40]">
                    <MessageCircle size={18} />
                    Comment
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-bold text-[#A19B95] hover:text-[#5A5A40]">
                    <Share2 size={18} />
                    Share
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          playdates.map(playdate => (
            <div key={playdate.id} className="bg-white rounded-[32px] border border-[#F0EBE6] p-6 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-[#F5F2ED] rounded-lg flex items-center justify-center text-[#5A5A40]">
                      <Calendar size={16} />
                    </div>
                    <h5 className="font-bold text-[#5A5A40]">{format(new Date(playdate.dateTime), 'EEEE, MMM dd @ HH:mm')}</h5>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#7C7670]">
                    <MapPin size={16} className="text-[#A19B95]" />
                    {playdate.location}
                  </div>
                  {playdate.notes && <p className="text-sm text-[#A19B95] italic">"{playdate.notes}"</p>}
                  <div className="flex items-center gap-2 pt-2">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full",
                      playdate.status === 'confirmed' ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
                    )}>
                      {playdate.status}
                    </span>
                  </div>
                </div>
                {playdate.hostId !== user?.uid && (
                  <button className="bg-[#5A5A40] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm">
                    Join Playdate
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
