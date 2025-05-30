// pages/contact.tsx
import { useState } from 'react';
import { supabase } from '@/supabaseClient';
import Link from 'next/link';
import Header from '@/components/Header';

export default function ContactPage() {
  const [formData, setFormData] = useState({
    nom: '',
    email: '',
    sujet: 'Question',
    message: '',
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    const { data, error } = await supabase.from('contacts').insert([formData]);

    if (error) {
      setErrorMessage('❌ Une erreur est survenue. Veuillez réessayer.');
    } else {
      setSuccessMessage('✅ Formulaire bien envoyé. Merci !');
      setFormData({
        nom: '',
        email: '',
        sujet: 'Question',
        message: '',
      });
    }
  };

  const handleTestSupabase = async () => {
    try {
      const res = await fetch('/api/test-commandes');  // GET par défaut
      const text = await res.text();
      if (!res.ok) {
        // si status ≠ 2xx, on affiche le body pour comprendre
        alert(`Erreur ${res.status} lors du test Supabase : ${text}`);
        return;
      }
      // on essaye de parser du JSON (si c'est du JSON)
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        alert(`Réponse inattendue (non JSON) : ${text}`);
        return;
      }
      if (json.success) {
        alert(`✅ Test Supabase réussi ! id créé : ${json.data?.[0]?.id || 'inconnu'}`);
      } else {
        alert(`❌ Test échoué : ${json.error}`);
      }
      console.log('Test commandes response:', json);
    } catch (err: any) {
      console.error('Fetch test-commandes error:', err);
      alert('❌ Erreur réseau lors du test Supabase : ' + err.message);
    }
  };

  return (
    <>
      <Header />
      <div className="min-h-screen bg-black text-white px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Contactez-nous</h1>

          <p className="mb-6 text-gray-300">
            Vous avez une question ou cherchez un événement spécifique ?<br />
            Notre équipe est là pour vous aider ! Nous répondons rapidement par email.
          </p>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* ... ton formulaire habituel ... */}
            </form>

            {successMessage && <p className="text-green-400 mt-4">{successMessage}</p>}
            {errorMessage && <p className="text-red-400 mt-4">{errorMessage}</p>}

            {/* BOUTON DE TEST SUPABASE */}
            <div className="mt-6">
              <button
                onClick={handleTestSupabase}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded"
              >
                Test Supabase
              </button>
            </div>

            <div className="mt-6 text-sm text-gray-400">
              📩 Vous pouvez aussi nous écrire à :{' '}
              <a href="mailto:contact@tixario.com" className="text-blue-400 underline">
                contact@tixario.com
              </a>
            </div>
          </div>

          {/* ... FAQ et lien retour ... */}

        </div>
      </div>
    </>
  );
}


