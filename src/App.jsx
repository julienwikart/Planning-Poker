import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, remove } from 'firebase/database';

// 🔥 REMPLACEZ PAR VOTRE CONFIG FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBnVj8lieyUR-ABFn03cTJbCMHipFV8gRs",
  authDomain: "planning-poker-e38d8.firebaseapp.com",
  databaseURL: "https://planning-poker-e38d8-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "planning-poker-e38d8",
  storageBucket: "planning-poker-e38d8.firebasestorage.app",
  messagingSenderId: "770949471783",
  appId: "1:770949471783:web:e9a7ad49d7787706a5b802"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const CARD_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Extraire le code de room depuis l'URL
const getRoomFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('room')?.toUpperCase() || '';
};

export default function PlanningPoker() {
  const [screen, setScreen] = useState('home');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState(getRoomFromURL());
  const [isObserver, setIsObserver] = useState(false);
  const [players, setPlayers] = useState({});
  const [roomData, setRoomData] = useState({ revealed: false, story: '' });
  const [selectedCard, setSelectedCard] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Détecter si on arrive via un lien partagé
  const hasRoomInURL = getRoomFromURL() !== '';

  // Écouter les changements de la room
  useEffect(() => {
    if (!roomCode) return;

    const roomRef = ref(database, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setPlayers(data.players || {});
        setRoomData({
          revealed: data.revealed || false,
          story: data.story || ''
        });
      }
    });

    return () => unsubscribe();
  }, [roomCode]);

  // Nettoyer le joueur quand il quitte
  useEffect(() => {
    if (!roomCode || !playerId) return;

    const handleBeforeUnload = () => {
      remove(ref(database, `rooms/${roomCode}/players/${playerId}`));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [roomCode, playerId]);

  const createRoom = async () => {
    if (!playerName.trim()) {
      setError('Entrez votre nom');
      return;
    }

    const code = generateRoomCode();
    const id = Date.now().toString();
    
    await set(ref(database, `rooms/${code}`), {
      createdAt: Date.now(),
      revealed: false,
      story: 'User Story #1',
      players: {
        [id]: {
          name: playerName.trim(),
          vote: null,
          isHost: true,
          isObserver: isObserver
        }
      }
    });

    setPlayerId(id);
    setRoomCode(code);
    setScreen('game');
    
    // Mettre à jour l'URL sans recharger la page
    window.history.pushState({}, '', `?room=${code}`);
  };

  const joinRoom = async () => {
    if (!playerName.trim()) {
      setError('Entrez votre nom');
      return;
    }
    if (!joinCode.trim()) {
      setError('Entrez le code de la room');
      return;
    }

    const code = joinCode.toUpperCase().trim();
    const id = Date.now().toString();

    try {
      // Vérifier si la room existe
      const roomRef = ref(database, `rooms/${code}`);
      
      await set(ref(database, `rooms/${code}/players/${id}`), {
        name: playerName.trim(),
        vote: null,
        isHost: false,
        isObserver: isObserver
      });

      setPlayerId(id);
      setRoomCode(code);
      setScreen('game');
      setError('');
      
      // Mettre à jour l'URL
      window.history.pushState({}, '', `?room=${code}`);
    } catch (err) {
      setError('Room introuvable');
    }
  };

  const handleVote = async (value) => {
    if (isObserver) return;
    setSelectedCard(value);
    await set(ref(database, `rooms/${roomCode}/players/${playerId}/vote`), value);
  };

  const handleReveal = async () => {
    await set(ref(database, `rooms/${roomCode}/revealed`), true);
  };

  const handleReset = async () => {
    await set(ref(database, `rooms/${roomCode}/revealed`), false);
    
    for (const pid of Object.keys(players)) {
      await set(ref(database, `rooms/${roomCode}/players/${pid}/vote`), null);
    }
    setSelectedCard(null);
  };

  const updateStory = async (newStory) => {
    await set(ref(database, `rooms/${roomCode}/story`), newStory);
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtrer les joueurs votants (non observateurs)
  const voters = Object.entries(players)
    .filter(([_, data]) => !data.isObserver)
    .map(([id, data]) => ({ id, ...data }));

  const observers = Object.entries(players)
    .filter(([_, data]) => data.isObserver)
    .map(([id, data]) => ({ id, ...data }));

  const playersList = Object.entries(players).map(([id, data]) => ({
    id,
    ...data
  }));

  // Statistiques des votes
  const votedCount = voters.filter(p => p.vote !== null).length;
  const totalVoters = voters.length;

  const getVoteStats = () => {
    const numericVotes = voters
      .filter(p => p.vote && !isNaN(parseInt(p.vote)))
      .map(p => parseInt(p.vote));
    
    if (numericVotes.length === 0) return { avg: '-', min: '-', max: '-' };
    
    const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
    const min = Math.min(...numericVotes);
    const max = Math.max(...numericVotes);
    
    return {
      avg: avg.toFixed(1),
      min: min.toString(),
      max: max.toString()
    };
  };

  // Écran d'accueil / rejoindre via lien
  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 w-full max-w-md shadow-2xl border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🃏 Planning Poker</h1>
            <p className="text-purple-200">Estimez vos stories en équipe</p>
          </div>

          {hasRoomInURL && (
            <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-4 mb-6 text-center">
              <p className="text-green-300 text-sm mb-1">Vous avez été invité à rejoindre</p>
              <p className="text-white font-mono font-bold text-xl tracking-widest">{joinCode}</p>
            </div>
          )}
          
          <div className="flex flex-col gap-4 mb-6">
            <input
              type="text"
              placeholder="Votre nom"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            
            {/* Choix du rôle */}
            <div className="flex gap-2">
              <button
                onClick={() => setIsObserver(false)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  !isObserver 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-white/10 text-purple-300 hover:bg-white/20'
                }`}
              >
                🗳️ Votant
              </button>
              <button
                onClick={() => setIsObserver(true)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  isObserver 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-white/10 text-purple-300 hover:bg-white/20'
                }`}
              >
                👁️ Observateur
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-300 text-center mb-4">{error}</p>
          )}

          {hasRoomInURL ? (
            // Mode: rejoindre via lien partagé
            <button
              onClick={joinRoom}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-105 shadow-lg"
            >
              🚀 Rejoindre la session
            </button>
          ) : (
            // Mode: page d'accueil normale
            <>
              <div className="flex flex-col gap-3 mb-6">
                <button
                  onClick={createRoom}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all transform hover:scale-105 shadow-lg"
                >
                  ✨ Créer une nouvelle room
                </button>
              </div>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-transparent px-4 text-purple-300 text-sm">ou rejoindre</span>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Code de la room"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border border-white/30 text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-400 uppercase tracking-widest text-center font-mono"
                />
                <button
                  onClick={joinRoom}
                  className="px-6 py-3 bg-white/20 text-white font-semibold rounded-xl hover:bg-white/30 transition-all"
                >
                  Rejoindre
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const stats = getVoteStats();

  // Écran de jeu
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">🃏 Planning Poker</h1>
            <div className="bg-white/20 px-4 py-2 rounded-xl flex items-center gap-2">
              <span className="text-purple-200 text-sm">Room:</span>
              <span className="text-white font-mono font-bold tracking-widest">{roomCode}</span>
              <button
                onClick={copyLink}
                className="ml-2 text-purple-300 hover:text-white transition-colors"
                title="Copier le lien"
              >
                {copied ? '✅' : '📋'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-purple-200">
              👤 {playerName} {isObserver && '(observateur)'}
            </span>
            <span className="text-purple-300">•</span>
            <span className="text-purple-200">
              {voters.length} votant{voters.length > 1 ? 's' : ''}
              {observers.length > 0 && `, ${observers.length} observateur${observers.length > 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {/* Story actuelle */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center gap-2 text-purple-300 text-sm mb-2">
            <span>📋</span>
            <span>Story en cours d'estimation</span>
          </div>
          <input
            type="text"
            value={roomData.story}
            onChange={(e) => updateStory(e.target.value)}
            className="w-full bg-transparent text-white text-xl font-medium focus:outline-none"
            placeholder="Décrivez la story à estimer..."
          />
        </div>

        {/* Table de vote */}
        <div className="bg-white/5 backdrop-blur-lg rounded-3xl p-8 mb-6 border border-white/10">
          <div className="text-center mb-4">
            <span className="text-purple-300">
              {roomData.revealed 
                ? '🎉 Votes révélés !' 
                : `${votedCount}/${totalVoters} votant${totalVoters > 1 ? 's' : ''} ${votedCount > 1 ? 'ont' : 'a'} voté`}
            </span>
          </div>

          {/* Votants */}
          <div className="flex flex-wrap justify-center gap-6 mb-6">
            {voters.map((player) => (
              <div key={player.id} className="flex flex-col items-center gap-2">
                <div 
                  className={`w-16 h-24 rounded-xl flex items-center justify-center text-2xl font-bold transition-all duration-500 ${
                    player.vote !== null
                      ? roomData.revealed 
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white' 
                        : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                      : 'bg-white/10 border-2 border-dashed border-white/30 text-white/30'
                  }`}
                >
                  {player.vote !== null
                    ? roomData.revealed 
                      ? player.vote 
                      : '✓'
                    : '?'}
                </div>
                <span className={`font-medium ${player.id === playerId ? 'text-yellow-300' : 'text-white'}`}>
                  {player.name} {player.id === playerId && '(vous)'}
                </span>
                {player.isHost && (
                  <span className="text-xs bg-yellow-500/30 text-yellow-300 px-2 py-0.5 rounded-full">Host</span>
                )}
              </div>
            ))}
          </div>

          {/* Observateurs */}
          {observers.length > 0 && (
            <div className="mb-6 pt-4 border-t border-white/10">
              <p className="text-purple-400 text-sm text-center mb-3">👁️ Observateurs</p>
              <div className="flex flex-wrap justify-center gap-3">
                {observers.map((observer) => (
                  <span 
                    key={observer.id}
                    className={`px-3 py-1 rounded-full text-sm ${
                      observer.id === playerId 
                        ? 'bg-yellow-500/30 text-yellow-300' 
                        : 'bg-white/10 text-purple-300'
                    }`}
                  >
                    {observer.name} {observer.id === playerId && '(vous)'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Résultats */}
          {roomData.revealed && (
            <div className="mb-6 p-4 bg-white/10 rounded-xl">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-purple-300 text-sm mb-1">⬇️ Min</p>
                  <p className="text-2xl font-bold text-white">{stats.min}</p>
                </div>
                <div>
                  <p className="text-purple-300 text-sm mb-1">📊 Moyenne</p>
                  <p className="text-3xl font-bold text-white">{stats.avg}</p>
                </div>
                <div>
                  <p className="text-purple-300 text-sm mb-1">⬆️ Max</p>
                  <p className="text-2xl font-bold text-white">{stats.max}</p>
                </div>
              </div>
            </div>
          )}

          {/* Boutons de contrôle */}
          <div className="flex justify-center gap-4">
            <button
              onClick={handleReveal}
              disabled={roomData.revealed || votedCount === 0}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              👁️ Révéler ({votedCount}/{totalVoters})
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-white/20 text-white font-semibold rounded-xl hover:bg-white/30 transition-all shadow-lg"
            >
              🔄 Nouveau vote
            </button>
          </div>
        </div>

        {/* Cartes de vote (uniquement pour les votants) */}
        {!isObserver ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <p className="text-purple-300 text-sm mb-4 text-center">Choisissez votre estimation</p>
            <div className="flex flex-wrap justify-center gap-3">
              {CARD_VALUES.map((value) => (
                <button
                  key={value}
                  onClick={() => handleVote(value)}
                  disabled={roomData.revealed}
                  className={`w-14 h-20 rounded-xl text-xl font-bold transition-all transform hover:scale-110 hover:-translate-y-2 shadow-lg ${
                    selectedCard === value
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white ring-4 ring-purple-300'
                      : 'bg-white text-gray-800 hover:bg-purple-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 text-center">
            <p className="text-purple-300">👁️ Vous êtes observateur - vous pouvez voir les votes mais pas participer</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-6 text-purple-300 text-sm">
          <p>🔗 Partagez le code <span className="font-mono font-bold">{roomCode}</span> ou cliquez sur 📋 pour copier le lien</p>
        </div>
      </div>
    </div>
  );
}
