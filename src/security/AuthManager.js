import { supabase } from '../services/supabase';

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutos em milissegundos
let timeoutId = null;

export const setupSessionTimeout = (onTimeout) => {
  const resetTimer = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      console.log("Sessão expirada por inatividade.");
      await supabase.auth.signOut();
      if (onTimeout) onTimeout();
    }, TIMEOUT_DURATION);
  };

  // Eventos para monitorar atividade
  const events = ['mousedown', 'keydown', 'touchstart', 'mousemove'];
  
  events.forEach(event => {
    window.addEventListener(event, resetTimer);
  });

  // Inicializa o timer
  resetTimer();

  // Cleanup
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    events.forEach(event => {
      window.removeEventListener(event, resetTimer);
    });
  };
};
