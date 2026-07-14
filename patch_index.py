import sys

def patch_index():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    if 'id="leadPopup"' in content:
        print("Popup already exists")
        return

    popup_html = """
  <!-- Lead Capture Popup (Glassmorphism) -->
  <div id="leadPopup" class="fixed inset-0 z-50 flex items-center justify-center p-4 opacity-0 pointer-events-none transition-opacity duration-500">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeLeadPopup()"></div>
    
    <!-- Modal -->
    <div class="relative w-full max-w-md transform scale-95 transition-transform duration-500" id="leadModalContent">
      <div class="glass-card bg-[#0d0800]/80 rounded-3xl p-8 border border-amber-400/20 shadow-[0_0_40px_rgba(251,191,36,0.15)] relative overflow-hidden">
        <!-- Decorative Glow -->
        <div class="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-[60px] pointer-events-none"></div>
        <div class="absolute bottom-0 left-0 w-48 h-48 bg-yellow-500/10 rounded-full blur-[60px] pointer-events-none"></div>
        
        <!-- Close Button -->
        <button onclick="closeLeadPopup()" class="absolute top-4 right-4 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2 transition cursor-pointer z-10">
          <i data-feather="x" class="w-4 h-4"></i>
        </button>
        
        <div class="relative z-10 text-center">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/20">
            <i data-feather="book-open" class="w-8 h-8 text-[#0d0800]"></i>
          </div>
          
          <h2 class="text-2xl font-black text-white mb-2 tracking-tight">Free Risk Workbook</h2>
          <p class="text-gray-400 text-sm mb-6 leading-relaxed">
            Stop blowing accounts. Download the exact risk management framework our funded VIPs use to stay profitable.
          </p>
          
          <form id="leadForm" onsubmit="submitLeadForm(event)" class="space-y-4">
            <div>
              <input type="text" id="leadName" placeholder="First Name" required
                class="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:border-amber-400/60 focus:outline-none focus:shadow-[0_0_10px_rgba(251,191,36,0.15)] transition" />
            </div>
            <div>
              <input type="email" id="leadEmail" placeholder="Email Address" required
                class="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white text-sm focus:border-amber-400/60 focus:outline-none focus:shadow-[0_0_10px_rgba(251,191,36,0.15)] transition" />
            </div>
            <button type="submit" id="leadSubmitBtn" class="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-dark-navy font-bold rounded-xl shadow-lg hover:shadow-amber-500/25 hover:brightness-110 transition flex justify-center items-center gap-2 cursor-pointer">
              <span>Send Me The Workbook</span>
              <i data-feather="arrow-right" class="w-4 h-4"></i>
            </button>
          </form>
          
          <div id="leadSuccess" class="hidden mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
            Success! Check your email (and spam folder) for the download link.
          </div>
          
          <p class="text-[10px] text-gray-500 mt-6">We respect your privacy. No spam, ever.</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Lead Capture Logic
    let popupShown = false;
    
    function showLeadPopup() {
      if (popupShown || localStorage.getItem('pa_lead_captured') === 'true') return;
      
      const popup = document.getElementById('leadPopup');
      const content = document.getElementById('leadModalContent');
      
      popup.classList.remove('opacity-0', 'pointer-events-none');
      content.classList.remove('scale-95');
      content.classList.add('scale-100');
      
      popupShown = true;
      if (window.feather) feather.replace();
    }
    
    function closeLeadPopup() {
      const popup = document.getElementById('leadPopup');
      const content = document.getElementById('leadModalContent');
      
      popup.classList.add('opacity-0', 'pointer-events-none');
      content.classList.remove('scale-100');
      content.classList.add('scale-95');
      
      // Don't show again in this session if they close it
      sessionStorage.setItem('pa_popup_closed', 'true');
    }
    
    async function submitLeadForm(e) {
      e.preventDefault();
      const btn = document.getElementById('leadSubmitBtn');
      const name = document.getElementById('leadName').value;
      const email = document.getElementById('leadEmail').value;
      
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="animate-pulse">Sending...</span>';
      btn.disabled = true;
      
      try {
        const res = await fetch('/api/public/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, source: 'homepage_popup' })
        });
        const data = await res.json();
        
        if (data.ok) {
          document.getElementById('leadForm').classList.add('hidden');
          document.getElementById('leadSuccess').classList.remove('hidden');
          localStorage.setItem('pa_lead_captured', 'true');
          setTimeout(() => { closeLeadPopup(); }, 4000);
        } else {
          alert(data.error || 'Something went wrong.');
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      } catch (err) {
        alert('Failed to connect to server.');
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
    
    // Trigger on exit intent
    document.addEventListener('mouseout', (e) => {
      if (e.clientY < 50 && !sessionStorage.getItem('pa_popup_closed')) {
        showLeadPopup();
      }
    });
    
    // Fallback: Trigger after 15 seconds
    setTimeout(() => {
      if (!sessionStorage.getItem('pa_popup_closed')) {
        showLeadPopup();
      }
    }, 15000);
  </script>
"""

    body_end = content.rfind('</body>')
    if body_end != -1:
        content = content[:body_end] + popup_html + content[body_end:]
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)

if __name__ == '__main__':
    patch_index()
