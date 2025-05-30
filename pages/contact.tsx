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
      const res = await fetch('/api/test-commandes', { method: 'POST' });
      const json = await res.json();
      console.log('Test commandes response:', json);
      alert(json.success ? 'Test Supabase réussi !' : 'Test échoué : ' + json.error);
    } catch (err) {
      console.error('Fetch test-commandes error:', err);
      alert('Erreur lors du test Supabase');
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
              <div>
                <label className="block text-sm mb-1">Nom</label>
                <input
                  type="text"
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded bg-gray-800 text-white border border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded bg-gray-800 text-white border border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Sujet</label>
                <select
                  value={formData.sujet}
                  onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-gray-800 text-white border border-gray-600"
                >
                  <option>Question</option>
                  <option>Problème</option>
                  <option>Partenariat</option>
                  <option>Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Message</label>
                <textarea
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded bg-gray-800 text-white border border-gray-600"
                />
              </div>
              <button
                type="submit"
                className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold px-6 py-2 rounded"
              >
                Envoyer
              </button>
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

          <h2 className="text-2xl font-bold mb-4">FAQ</h2>

          <div className="space-y-6 text-gray-300 text-sm">
            {/* ... le reste de ta FAQ ... */}
          </div>

          <div className="mt-12 text-center">
            <Link href="/" className="text-blue-400 underline">
              ← Retour à l’accueil
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

