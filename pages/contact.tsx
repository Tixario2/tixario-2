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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    const { data, error } = await supabase.from('contacts').insert([formData]);

    if (error) {
      setErrorMessage("❌ Une erreur est survenue. Veuillez réessayer.");
    } else {
      setSuccessMessage("✅ Formulaire bien envoyé. Merci !");
      setFormData({
        nom: '',
        email: '',
        sujet: 'Question',
        message: '',
      });
    }
  };

  return (
    <>
      <Header />
      <div className="min-h-screen bg-black text-white px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Contactez-nous</h1>

          <p className="mb-6 text-gray-300">
            Vous avez une question ou cherchez un événement spécifique ? <br />
            Notre équipe est là pour vous aider ! Nous répondons rapidement par email.
          </p>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-12">
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

            <div className="mt-6 text-sm text-gray-400">
              📩 Vous pouvez aussi nous écrire à : <a href="mailto:contact@tixario.com" className="text-blue-400 underline">contact@tixario.com</a>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-4">FAQ</h2>

          <div className="space-y-6 text-gray-300 text-sm">
            <div>
              <h3 className="font-semibold text-white">Quand vais-je recevoir mes billets ?</h3>
              <p>
                Nous envoyons les billets sous 24h après réception du paiement, par email ou WhatsApp.
                Pour certains événements, les billets ne sont pas encore disponibles immédiatement : dans ce cas, ils sont sécurisés en interne et envoyés dès qu’ils deviennent disponibles.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Comment être sûr que les billets sont authentiques ?</h3>
              <p>
                Tous les billets que nous vendons sont 100% garantis valides. En cas de problème, vous êtes intégralement remboursé.
                Consultez nos avis sur Google et les stories de nos clients sur Instagram.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Quels sont les moyens de paiement acceptés ?</h3>
              <p>Nous acceptons les cartes bancaires via Stripe ainsi que les virements bancaires.</p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Je ne trouve pas l’événement que je cherche. Que faire ?</h3>
              <p>Contactez-nous avec les détails (nom de l’événement, budget, nombre de places), et on s’en occupe.</p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Que se passe-t-il si un événement est annulé ?</h3>
              <p>En cas d’annulation officielle, vous êtes remboursé ou recevrez des billets pour la nouvelle date.</p>
            </div>
            <div>
              <h3 className="font-semibold text-white">Puis-je modifier ou annuler une commande ?</h3>
              <p>Les commandes ne sont pas modifiables ni annulables une fois confirmées, sauf cas exceptionnels.</p>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link href="/" className="text-blue-400 underline">
              ← Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
