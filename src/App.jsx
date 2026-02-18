import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, remove, get } from 'firebase/database';

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
const ROOM_EXPIRY_HOURS = 24;

const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const getRoomFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('room')?.toUpperCase() || '';
};

const isRoomExpired = (createdAt) => {
  if (!createdAt) return false;
  const now = Date.now();
  const expiryTime = ROOM_EXPIRY_HOURS * 60 * 60 * 1000;
  return (now - createdAt) > expiryTime;
};

export default function PlanningPoker() {
  const [screen, setScreen] = useState('home');
  const [playerName, setPlayerName] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState(getRoomFromURL());
  const [isObserver, setIsObserver] = useState(false);
  const [players, setPlayers] = useState({});
  const [roomData, setRoomData] = useState({ revealed: false, story: '', createdAt: null });
  const [selectedCard, setSelectedCard] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [roomExpired, setRoomExpired] = useState(false);

  const hasRoomInURL = getRoomFromURL() !== '';

  // Vérifier si la room dans l'URL est expirée avant même de rejoindre
  useEffect(() => {
    const checkRoomFromURL = async () => {
      const urlRoomCode = getRoomFromURL();
      if (!urlRoomCode) return;

      try {
        const roomRef = ref(database, `rooms/${urlRoomCode}`);
        const snapshot = await get(roomRef);
        const data = snapshot.val();

        if (!data) {
          setError('Cette room n\'existe pas ou a été supprimée');
          setJoinCode('');
          window.history.pushState({}, '', window.location.pathname);
        } else if (isRoomExpired(data.createdAt)) {
          // Room expirée : on la supprime
          await remove(roomRef);
          setError('Cette room a expiré et a été supprimée');
          setJoinCode('');
          window.history.pushState({}, '', window.location.pathname);
        }
      } catch (err) {
        console.error('Erreur vérification room:', err);
      }
    };

    checkRoomFromURL();
  }, []);

  // Écouter les changements de la room
  useEffect(() => {
    if (!roomCode) return;

    const roomRef = ref(database, `rooms/${roomCode}`);
    const unsubscribe = onValue(roomRef, async (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        // Room supprimée
        setRoomExpired(true);
        return;
      }

      // Vérifier l'expiration
      if (isRoomExpired(data.createdAt)) {
        // Supprimer la room expirée
        await remove(roomRef);
        setRoomExpired(true);
        return;
      }

      setPlayers(data.players || {});
      setRoomData({
        revealed: data.revealed || false,
        story: data.story || '',
        createdAt: data.createdAt
      });
    });

    return () => unsubscribe();
  }, [roomCode]);

  useEffect(() => {
    if (playerId && players[playerId]) {
      setSelectedCard(players[playerId].vote);
    }
  }, [players, playerId]);

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
    setRoomExpired(false);
    setScreen('game');
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
      // Vérifier si la room existe et n'est pas expirée
      const roomRef = ref(database, `rooms/${code}`);
      const snapshot = await get(roomRef);
      const data = snapshot.val();

      if (!data) {
        setError('Cette room n\'existe pas');
        return;
      }

      if (isRoomExpired(data.createdAt)) {
        // Supprimer la room expirée
        await remove(roomRef);
        setError('Cette room a expiré et a été supprimée');
        return;
      }

      await set(ref(database, `rooms/${code}/players/${id}`), {
        name: playerName.trim(),
        vote: null,
        isHost: false,
        isObserver: isObserver
      });

      setPlayerId(id);
      setRoomCode(code);
      setRoomExpired(false);
      setScreen('game');
      setError('');
      window.history.pushState({}, '', `?room=${code}`);
    } catch (err) {
      setError('Erreur lors de la connexion');
    }
  };

  const handleVote = async (value) => {
    if (isObserver) return;
    await set(ref(database, `rooms/${roomCode}/players/${playerId}/vote`), value);
  };

  const handleReveal = async () => {
    await set(ref(database, `rooms/${roomCode}/revealed`), true);
  };

  const handleReset = async () => {
    await set(ref(database, `rooms/${roomCode}/revealed`), false);
    const resetPromises = Object.keys(players).map(pid =>
      set(ref(database, `rooms/${roomCode}/players/${pid}/vote`), null)
    );
    await Promise.all(resetPromises);
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

  const backToHome = () => {
    setScreen('home');
    setRoomCode('');
    setRoomExpired(false);
    setError('');
    setJoinCode('');
    window.history.pushState({}, '', window.location.pathname);
  };

  const formatTimeRemaining = () => {
    if (!roomData.createdAt) return '';
    const elapsed = Date.now() - roomData.createdAt;
    const remaining = (ROOM_EXPIRY_HOURS * 60 * 60 * 1000) - elapsed;
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  };

  const voters = Object.entries(players)
    .filter(([_, data]) => !data.isObserver)
    .map(([id, data]) => ({ id, ...data }));

  const observers = Object.entries(players)
    .filter(([_, data]) => data.isObserver)
    .map(([id, data]) => ({ id, ...data }));

  const votedCount = voters.filter(p => p.vote !== null && p.vote !== undefined).length;
  const totalVoters = voters.length;

  const getVoteStats = () => {
    const allVotes = voters.filter(p => p.vote !== null && p.vote !== undefined);
    const numericVotes = allVotes
      .filter(p => !isNaN(parseInt(p.vote)))
      .map(p => parseInt(p.vote));

    const distribution = {};
    allVotes.forEach(p => {
      distribution[p.vote] = (distribution[p.vote] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(distribution), 0);
    const mode = Object.keys(distribution).filter(v => distribution[v] === maxCount);

    if (numericVotes.length === 0)
      return { avg: '-', min: '-', max: '-', delta: null, distribution, mode, consensus: null };

    const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
    const min = Math.min(...numericVotes);
    const max = Math.max(...numericVotes);
    const delta = max - min;

    let consensus;
    if (delta === 0) consensus = 'perfect';
    else if (delta <= 2) consensus = 'good';
    else if (delta <= 5) consensus = 'moderate';
    else consensus = 'divergent';

    return {
      avg: avg.toFixed(1),
      min: min.toString(),
      max: max.toString(),
      delta,
      distribution,
      mode,
      consensus,
    };
  };

  // Écran room expirée
  if (roomExpired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-orange-100 p-8 w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-gray-400 to-gray-500 rounded-2xl mb-4 shadow-lg">
            <span className="text-3xl">⏰</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Room expirée</h1>
          <p className="text-gray-500 mb-6">
            Cette session a expiré après {ROOM_EXPIRY_HOURS} heures d'inactivité et a été automatiquement supprimée.
          </p>
          <button
            onClick={backToHome}
            className="w-full py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-rose-600 transition-all shadow-lg"
          >
            Créer une nouvelle session
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl border border-orange-100 p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-400 to-rose-500 rounded-2xl mb-4 shadow-lg">
              <span className="text-3xl">🎯</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Planning Poker</h1>
            <p className="text-gray-500 text-sm">Estimation collaborative pour équipes agiles</p>
          </div>

          {hasRoomInURL && joinCode && !error && (
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 mb-6 text-center">
              <p className="text-orange-700 text-sm mb-1">Vous avez été invité à rejoindre</p>
              <p className="text-gray-800 font-mono font-bold text-xl tracking-widest">{joinCode}</p>
            </div>
          )}

          <div className="flex flex-col gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Votre nom</label>
              <input
                type="text"
                placeholder="Jean Dupont"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Rôle</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsObserver(false)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                    !isObserver
                      ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  🗳️ Votant
                </button>
                <button
                  onClick={() => setIsObserver(true)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
                    isObserver
                      ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  👁️ Observateur
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center mb-4 bg-red-50 py-2 rounded-lg">{error}</p>
          )}

          {hasRoomInURL && joinCode && !error ? (
            <button
              onClick={joinRoom}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-rose-600 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Rejoindre la session
            </button>
          ) : (
            <>
              <button
                onClick={createRoom}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-rose-600 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 mb-4"
              >
                ✨ Créer une session
              </button>

              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-gray-400 text-sm">ou rejoindre</span>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="CODE"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    setError('');
                  }}
                  maxLength={6}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 uppercase tracking-widest text-center font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all"
                />
                <button
                  onClick={joinRoom}
                  className="px-5 py-2.5 bg-gray-800 text-white font-medium rounded-xl hover:bg-gray-700 transition-all"
                >
                  Rejoindre
                </button>
              </div>
            </>
          )}

          <p className="text-xs text-gray-400 text-center mt-6">
            Les sessions expirent automatiquement après {ROOM_EXPIRY_HOURS}h
          </p>
        </div>
      </div>
    );
  }

  const stats = getVoteStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-orange-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-rose-500 rounded-lg flex items-center justify-center">
                <span className="text-sm">🎯</span>
              </div>
              <h1 className="text-lg font-bold text-gray-800">Planning Poker</h1>
            </div>
            <div className="flex items-center gap-2 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
              <span className="text-orange-600 text-sm">Room:</span>
              <span className="font-mono font-bold text-gray-800 tracking-wider">{roomCode}</span>
              <button
                onClick={copyLink}
                className="ml-1 text-orange-400 hover:text-orange-600 transition-colors"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
            <span className="text-xs text-gray-400" title="Temps restant avant expiration">
              ⏱️ {formatTimeRemaining()}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
              {playerName} {isObserver && '👁️'}
            </span>
            <span className="text-orange-500 font-medium">
              {voters.length} votant{voters.length > 1 ? 's' : ''}
              {observers.length > 0 && <span className="text-gray-400"> + {observers.length} obs.</span>}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 flex flex-col gap-4">
        {/* Story */}
        <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-5">
          <label className="block text-xs font-semibold text-orange-500 uppercase tracking-wide mb-2">📋 Story à estimer</label>
          <input
            type="text"
            value={roomData.story}
            onChange={(e) => updateStory(e.target.value)}
            className="w-full text-lg text-gray-800 font-medium bg-transparent focus:outline-none"
            placeholder="Décrivez la story..."
          />
        </div>

        {/* Voting area */}
        <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-6">
          <div className="text-center mb-6">
            <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium ${
              roomData.revealed 
                ? 'bg-green-100 text-green-700' 
                : votedCount === totalVoters && totalVoters > 0
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-600'
            }`}>
              {roomData.revealed
                ? '✨ Votes révélés !'
                : votedCount === 0
                  ? `⏳ En attente des votes (0/${totalVoters})`
                  : votedCount === totalVoters
                    ? `🎉 Tout le monde a voté !`
                    : `${votedCount}/${totalVoters} vote${votedCount > 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Voters */}
          <div className="flex flex-wrap justify-center gap-5 mb-6">
            {voters.map((player) => (
              <div key={player.id} className="flex flex-col items-center gap-2">
                <div
                  className={`w-16 h-24 rounded-xl flex items-center justify-center text-2xl font-bold transition-all shadow-md ${
                    player.vote !== null && player.vote !== undefined
                      ? roomData.revealed
                        ? 'bg-gradient-to-br from-orange-400 to-rose-500 text-white'
                        : 'bg-gradient-to-br from-gray-700 to-gray-800 text-white'
                      : 'bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 text-gray-400'
                  }`}
                >
                  {player.vote !== null && player.vote !== undefined
                    ? roomData.revealed ? player.vote : '✓'
                    : '?'}
                </div>
                <span className={`text-sm font-medium ${player.id === playerId ? 'text-orange-600' : 'text-gray-600'}`}>
                  {player.name}
                </span>
              </div>
            ))}
          </div>

          {/* Observers */}
          {observers.length > 0 && (
            <div className="pt-4 border-t border-gray-100 mb-6">
              <p className="text-xs text-gray-400 text-center mb-2 uppercase tracking-wide">👁️ Observateurs</p>
              <div className="flex flex-wrap justify-center gap-2">
                {observers.map((obs) => (
                  <span
                    key={obs.id}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      obs.id === playerId ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {obs.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {roomData.revealed && (() => {
            const consensusTheme = {
              perfect:  { bg: 'from-green-50 to-emerald-50',  border: 'border-green-100',  divider: 'border-green-200' },
              good:     { bg: 'from-blue-50 to-sky-50',        border: 'border-blue-100',   divider: 'border-blue-200' },
              moderate: { bg: 'from-orange-50 to-rose-50',     border: 'border-orange-100', divider: 'border-orange-200' },
              divergent:{ bg: 'from-red-50 to-rose-50',        border: 'border-red-100',    divider: 'border-red-200' },
            };
            const theme = consensusTheme[stats.consensus] || consensusTheme.moderate;
            return (
            <div className={`bg-gradient-to-r ${theme.bg} rounded-xl p-5 mb-6 border ${theme.border}`}>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">⬇️ Min</p>
                  <p className="text-3xl font-bold text-gray-800">{stats.min}</p>
                </div>
                <div className={`border-x ${theme.divider}`}>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">📊 Moyenne</p>
                  <p className="text-4xl font-bold bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent">{stats.avg}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">⬆️ Max</p>
                  <p className="text-3xl font-bold text-gray-800">{stats.max}</p>
                </div>
              </div>
              {stats.consensus && (
                <div className="mt-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                    stats.consensus === 'perfect'  ? 'bg-green-100 text-green-700' :
                    stats.consensus === 'good'     ? 'bg-blue-100 text-blue-700' :
                    stats.consensus === 'moderate' ? 'bg-orange-100 text-orange-700' :
                                                     'bg-red-100 text-red-700'
                  }`}>
                    {stats.consensus === 'perfect'  ? '✅ Consensus parfait' :
                     stats.consensus === 'good'     ? '👍 Bon consensus' :
                     stats.consensus === 'moderate' ? '💬 À discuter' :
                                                      '⚠️ Forte divergence'}
                  </span>
                </div>
              )}
              {Object.keys(stats.distribution).length > 0 && (
                <div className={`mt-4 pt-4 border-t ${theme.border}`}>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Répartition des votes</p>
                  <div className="space-y-2">
                    {['0','1','2','3','5','8','13','21','?','☕']
                      .filter(v => stats.distribution[v])
                      .map(value => {
                        const count = stats.distribution[value];
                        const pct = Math.round((count / votedCount) * 100);
                        const isMode = stats.mode.includes(value);
                        return (
                          <div key={value} className="flex items-center gap-2">
                            <span className={`w-8 text-sm font-bold text-right ${isMode ? 'text-orange-600' : 'text-gray-600'}`}>
                              {value}
                            </span>
                            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isMode ? 'bg-gradient-to-r from-orange-400 to-rose-400' : 'bg-gray-300'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-20 text-right">
                              {count} votant{count > 1 ? 's' : ''} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {/* Controls */}
          <div className="flex justify-center gap-3">
            <button
              onClick={handleReveal}
              disabled={roomData.revealed || votedCount === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white text-sm font-semibold rounded-xl hover:from-orange-600 hover:to-rose-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md"
            >
              👁️ Révéler ({votedCount}/{totalVoters})
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-all"
            >
              🔄 Nouveau vote
            </button>
          </div>
        </div>

        {/* Cards */}
        {!isObserver ? (
          <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-5">
            <p className="text-xs text-orange-500 text-center mb-4 uppercase tracking-wide font-semibold">🃏 Votre estimation</p>
            <div className="flex flex-wrap justify-center gap-3">
              {CARD_VALUES.map((value) => (
                <button
                  key={value}
                  onClick={() => handleVote(value)}
                  disabled={roomData.revealed}
                  className={`w-14 h-20 rounded-xl text-xl font-bold transition-all transform hover:scale-110 hover:-translate-y-1 ${
                    selectedCard === value
                      ? 'bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-lg ring-4 ring-orange-200'
                      : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-orange-300 hover:shadow-md'
                  } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-5 text-center">
            <p className="text-sm text-gray-500">👁️ Mode observateur — vous ne participez pas au vote</p>
          </div>
        )}
      </main>
    </div>
  );
}
