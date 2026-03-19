import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Heart, Share2, Plus, Image as ImageIcon, Video as VideoIcon, Loader2, AlertCircle, X, Send } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, limit, updateDoc, doc, arrayUnion, arrayRemove, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { useFirebase } from '../FirebaseProvider';
import { ForumPost, ForumComment } from '../types';
import { format } from 'date-fns';
import { moderateContent } from '../services/gemini';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export default function CommunityForum() {
  const { user, loading: authLoading } = useFirebase();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [isAddingPost, setIsAddingPost] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isModerating, setIsModerating] = useState(false);

  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    mediaUrl: '',
    mediaType: 'image' as 'image' | 'video'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    const postsQuery = query(collection(db, 'forum_posts'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ForumPost[]);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'forum_posts');
    });

    return () => unsubscribe();
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading || !user || !selectedPost) {
      setComments([]);
      return;
    }

    const commentsQuery = query(
      collection(db, 'forum_comments'),
      where('postId', '==', selectedPost.id),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ForumComment[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'forum_comments');
    });

    return () => unsubscribe();
  }, [authLoading, user, selectedPost]);

  const handleCreatePost = async () => {
    if (!user || !newPost.title || !newPost.content) return;

    setIsModerating(true);
    const moderation = await moderateContent(`${newPost.title}\n${newPost.content}`);
    
    if (moderation.suggestedAction === 'reject') {
      alert(`Post rejected: ${moderation.reason}`);
      setIsModerating(false);
      return;
    }

    try {
      await addDoc(collection(db, 'forum_posts'), {
        authorId: user.uid,
        authorName: user.displayName || 'Pet Lover',
        title: newPost.title,
        content: newPost.content,
        mediaUrl: newPost.mediaUrl,
        mediaType: newPost.mediaType,
        createdAt: serverTimestamp(),
        commentCount: 0,
        likeCount: 0,
        likes: [],
        isModerated: moderation.suggestedAction === 'flag',
        moderationReason: moderation.reason || ''
      });
      setIsAddingPost(false);
      setNewPost({ title: '', content: '', mediaUrl: '', mediaType: 'image' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'forum_posts');
    } finally {
      setIsModerating(false);
    }
  };

  const handleAddComment = async () => {
    if (!user || !selectedPost || !newComment.trim()) return;

    try {
      await addDoc(collection(db, 'forum_comments'), {
        postId: selectedPost.id,
        authorId: user.uid,
        authorName: user.displayName || 'Pet Lover',
        content: newComment,
        createdAt: serverTimestamp()
      });

      const postRef = doc(db, 'forum_posts', selectedPost.id);
      await updateDoc(postRef, {
        commentCount: (selectedPost.commentCount || 0) + 1
      });

      setNewComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'forum_comments');
    }
  };

  const toggleLike = async (post: ForumPost) => {
    if (!user) return;
    const postRef = doc(db, 'forum_posts', post.id);
    const isLiked = post.likes?.includes(user.uid);

    try {
      await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likeCount: isLiked ? (post.likeCount || 1) - 1 : (post.likeCount || 0) + 1
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `forum_posts/${post.id}`);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewPost(prev => ({
        ...prev,
        mediaUrl: reader.result as string,
        mediaType: file.type.startsWith('video') ? 'video' : 'image'
      }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-[#5A5A40]/10 pb-6">
        <div>
          <h1 className="text-5xl font-serif font-black text-[#5A5A40] tracking-tighter uppercase leading-none">
            Community<br />Forum
          </h1>
          <p className="text-sm text-[#A19B95] mt-2 font-medium tracking-wide uppercase">
            Share, Learn, and Connect with Pet Lovers
          </p>
        </div>
        <button 
          onClick={() => setIsAddingPost(true)}
          className="bg-[#5A5A40] text-white px-8 py-3 rounded-full font-bold text-sm tracking-widest uppercase hover:scale-105 transition-transform shadow-lg"
        >
          Create Post
        </button>
      </div>

      {/* Post Creation Modal */}
      {isAddingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[40px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-serif font-bold text-[#5A5A40]">New Discussion</h2>
                <button onClick={() => setIsAddingPost(false)} className="p-2 hover:bg-[#F5F2ED] rounded-full transition-colors">
                  <X size={24} className="text-[#A19B95]" />
                </button>
              </div>

              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Catchy Title"
                  value={newPost.title}
                  onChange={e => setNewPost({...newPost, title: e.target.value})}
                  className="w-full text-xl font-bold bg-[#FDFCFB] border-none focus:ring-0 placeholder:text-[#A19B95]/40"
                />
                <textarea 
                  placeholder="What's on your mind?"
                  value={newPost.content}
                  onChange={e => setNewPost({...newPost, content: e.target.value})}
                  className="w-full min-h-[150px] bg-[#FDFCFB] border-none focus:ring-0 text-[#7C7670] resize-none"
                />

                {newPost.mediaUrl && (
                  <div className="relative rounded-2xl overflow-hidden aspect-video bg-[#F5F2ED]">
                    {newPost.mediaType === 'image' ? (
                      <img src={newPost.mediaUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <video src={newPost.mediaUrl} className="w-full h-full object-cover" />
                    )}
                    <button 
                      onClick={() => setNewPost({...newPost, mediaUrl: ''})}
                      className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-4 pt-4 border-t border-[#F0EBE6]">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 text-sm font-bold text-[#5A5A40] hover:bg-[#F5F2ED] px-4 py-2 rounded-xl transition-colors"
                  >
                    <ImageIcon size={20} />
                    Photo / Video
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                </div>
              </div>

              <button 
                onClick={handleCreatePost}
                disabled={isModerating || !newPost.title || !newPost.content}
                className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold text-lg shadow-xl hover:shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isModerating ? <Loader2 className="animate-spin" /> : 'Publish Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post List */}
      <div className="grid gap-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-[#5A5A40]" size={40} />
          </div>
        ) : posts.map(post => (
          <article 
            key={post.id} 
            className="group bg-white rounded-[48px] border border-[#F0EBE6] overflow-hidden hover:shadow-2xl transition-all duration-500 cursor-pointer"
            onClick={() => setSelectedPost(post)}
          >
            {post.mediaUrl && (
              <div className="aspect-[16/9] overflow-hidden bg-[#F5F2ED]">
                {post.mediaType === 'image' ? (
                  <img src={post.mediaUrl} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
                ) : (
                  <video src={post.mediaUrl} className="w-full h-full object-cover" />
                )}
              </div>
            )}
            <div className="p-10 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#F5F2ED] rounded-full flex items-center justify-center font-bold text-[#5A5A40]">
                  {post.authorName[0]}
                </div>
                <div>
                  <h4 className="font-bold text-[#5A5A40] text-sm">{post.authorName}</h4>
                  <p className="text-[10px] text-[#A19B95] uppercase tracking-widest font-bold">
                    {post.createdAt?.seconds ? format(new Date(post.createdAt.seconds * 1000), 'MMMM dd, yyyy') : 'Just now'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-3xl font-serif font-black text-[#5A5A40] leading-tight group-hover:text-[#8B8B6B] transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-[#7C7670] leading-relaxed line-clamp-3">
                  {post.content}
                </p>
              </div>

              <div className="flex items-center gap-8 pt-6 border-t border-[#F0EBE6]">
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleLike(post); }}
                  className={cn(
                    "flex items-center gap-2 text-sm font-bold transition-colors",
                    post.likes?.includes(user?.uid || '') ? "text-red-500" : "text-[#A19B95] hover:text-[#5A5A40]"
                  )}
                >
                  <Heart size={20} fill={post.likes?.includes(user?.uid || '') ? "currentColor" : "none"} />
                  {post.likeCount || 0}
                </button>
                <button className="flex items-center gap-2 text-sm font-bold text-[#A19B95] hover:text-[#5A5A40]">
                  <MessageSquare size={20} />
                  {post.commentCount || 0}
                </button>
                <button className="flex items-center gap-2 text-sm font-bold text-[#A19B95] hover:text-[#5A5A40] ml-auto">
                  <Share2 size={20} />
                </button>
              </div>

              {post.isModerated && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-orange-600 bg-orange-50 p-2 rounded-lg uppercase tracking-wider">
                  <AlertCircle size={14} />
                  This post is under review by Pawesome AI
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-white rounded-[48px] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 duration-500">
            <div className="flex-1 overflow-y-auto">
              <div className="relative">
                {selectedPost.mediaUrl && (
                  <div className="aspect-video bg-black">
                    {selectedPost.mediaType === 'image' ? (
                      <img src={selectedPost.mediaUrl} alt={selectedPost.title} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <video src={selectedPost.mediaUrl} className="w-full h-full object-contain" controls />
                    )}
                  </div>
                )}
                <button 
                  onClick={() => setSelectedPost(null)}
                  className="absolute top-6 right-6 bg-white/20 backdrop-blur-md text-white p-3 rounded-full hover:bg-white/40 transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-12 space-y-10">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#F5F2ED] rounded-full flex items-center justify-center font-bold text-[#5A5A40] text-xl">
                      {selectedPost.authorName[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-[#5A5A40]">{selectedPost.authorName}</h4>
                      <p className="text-xs text-[#A19B95] uppercase tracking-widest font-bold">
                        {selectedPost.createdAt?.seconds ? format(new Date(selectedPost.createdAt.seconds * 1000), 'MMMM dd, yyyy @ HH:mm') : 'Just now'}
                      </p>
                    </div>
                  </div>
                  <h2 className="text-5xl font-serif font-black text-[#5A5A40] leading-tight">
                    {selectedPost.title}
                  </h2>
                  <p className="text-xl text-[#7C7670] leading-relaxed whitespace-pre-wrap">
                    {selectedPost.content}
                  </p>
                </div>

                <div className="space-y-8">
                  <h3 className="text-2xl font-serif font-bold text-[#5A5A40] border-b border-[#F0EBE6] pb-4">
                    Comments ({comments.length})
                  </h3>
                  <div className="space-y-6">
                    {comments.map(comment => (
                      <div key={comment.id} className="flex gap-4">
                        <div className="w-10 h-10 bg-[#F5F2ED] rounded-full flex items-center justify-center font-bold text-[#5A5A40] flex-shrink-0">
                          {comment.authorName[0]}
                        </div>
                        <div className="bg-[#FDFCFB] p-6 rounded-[32px] flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <h5 className="font-bold text-[#5A5A40] text-sm">{comment.authorName}</h5>
                            <span className="text-[10px] text-[#A19B95] font-bold uppercase tracking-widest">
                              {comment.createdAt?.seconds ? format(new Date(comment.createdAt.seconds * 1000), 'MMM dd') : 'Now'}
                            </span>
                          </div>
                          <p className="text-[#7C7670] text-sm leading-relaxed">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Comment Input */}
            <div className="p-8 bg-[#FDFCFB] border-t border-[#F0EBE6]">
              <div className="flex gap-4">
                <input 
                  type="text" 
                  placeholder="Add your thoughts..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 bg-white border-[#F0EBE6] rounded-2xl px-6 py-4 text-sm focus:ring-[#5A5A40] focus:border-[#5A5A40] shadow-sm"
                />
                <button 
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="bg-[#5A5A40] text-white px-8 rounded-2xl font-bold text-sm shadow-md hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2"
                >
                  <Send size={18} />
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
