import re
import sys

def patch_admin():
    with open('admin.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Inject Quill CSS/JS in head
    if 'quill.snow.css' not in content:
        head_end = content.find('</head>')
        quill_tags = """
  <!-- Quill Rich Text Editor -->
  <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
  <script src="https://cdn.quilljs.com/1.3.6/quill.min.js"></script>
"""
        content = content[:head_end] + quill_tags + content[head_end:]

    # 2. Inject Tabs
    if 'id="tab-leads"' not in content:
        tabs_end = content.find('</button>\n    </div>', content.find('id="adminTabs"'))
        if tabs_end == -1:
            tabs_end = content.find('</div>', content.find('id="adminTabs"'))
        
        new_tabs = """
      <button onclick="switchAdminTab('leads')" id="tab-leads" class="px-5 py-2 rounded-xl text-sm font-bold bg-black/40 text-gray-400 border border-white/10 hover:text-white transition">
        Leads
      </button>
      <button onclick="switchAdminTab('blog')" id="tab-blog" class="px-5 py-2 rounded-xl text-sm font-bold bg-black/40 text-gray-400 border border-white/10 hover:text-white transition">
        Blog Manager
      </button>"""
        # Find the last button inside adminTabs
        button_end = content.rfind('</button>', 0, tabs_end) + 9
        content = content[:button_end] + new_tabs + content[button_end:]

    # 3. Inject Panels before </main>
    if 'id="leadsPanel"' not in content:
        main_end = content.find('</main>')
        panels = """
    <!-- LEADS PANEL -->
    <div id="leadsPanel" class="hidden">
      <div class="glass-card rounded-2xl p-6 border border-white/10 mb-8">
        <div class="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <i data-feather="users" class="w-5 h-5 text-amber-400"></i> Leads Management
          </h2>
          <button onclick="exportLeadsCSV()" class="px-4 py-2 bg-amber-400/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-400/50 hover:bg-amber-400 hover:text-dark-navy transition">
            Export CSV
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-gray-400">
            <thead class="text-xs text-gray-500 uppercase bg-black/40">
              <tr>
                <th class="px-4 py-3 rounded-tl-lg">Email</th>
                <th class="px-4 py-3">Name</th>
                <th class="px-4 py-3">Source</th>
                <th class="px-4 py-3">Date</th>
                <th class="px-4 py-3 text-right rounded-tr-lg">Action</th>
              </tr>
            </thead>
            <tbody id="leadsTableBody">
              <tr><td colspan="5" class="text-center py-4 text-xs">Loading leads...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- BLOG PANEL -->
    <div id="blogPanel" class="hidden">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <!-- Editor -->
        <div class="lg:col-span-8 glass-card rounded-2xl p-6 border border-white/10">
          <h2 class="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">Write Article</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-gray-400 mb-1">Title</label>
              <input type="text" id="blogTitle" class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-amber-400" placeholder="E.g. How to pass FTMO...">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-gray-400 mb-1">Category</label>
                <input type="text" id="blogCategory" class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-amber-400" placeholder="E.g. Forex Education">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-400 mb-1">Author</label>
                <input type="text" id="blogAuthor" value="Pips Attendant" class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-amber-400">
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-400 mb-1">Excerpt (Short Description)</label>
              <textarea id="blogExcerpt" rows="2" class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-amber-400"></textarea>
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-400 mb-1">Cover Image URL (Optional)</label>
              <input type="text" id="blogCover" class="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-amber-400" placeholder="https://...">
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-400 mb-1">Content</label>
              <div id="quillEditor" class="bg-white/5 text-white" style="height: 300px; border-radius: 0 0 8px 8px; border-color: rgba(255,255,255,0.1);"></div>
            </div>
            <div class="flex gap-4 pt-4">
              <button onclick="saveBlogPost('published')" class="flex-1 py-3 bg-amber-400 text-dark-navy font-bold rounded-xl hover:bg-amber-300 transition cursor-pointer">Publish</button>
              <button onclick="saveBlogPost('draft')" class="flex-1 py-3 bg-white/10 text-white font-bold rounded-xl hover:bg-white/20 transition cursor-pointer">Save Draft</button>
              <input type="hidden" id="blogEditId" value="">
            </div>
          </div>
        </div>
        
        <!-- Post List -->
        <div class="lg:col-span-4 glass-card rounded-2xl p-6 border border-white/10 h-fit">
          <h3 class="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Manage Posts</h3>
          <div id="blogList" class="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            <p class="text-xs text-gray-500 text-center">Loading posts...</p>
          </div>
        </div>
      </div>
    </div>
"""
        content = content[:main_end] + panels + content[main_end:]

    # 4. Inject JS logic
    if 'async function fetchLeads()' not in content:
        # Before the final </script>
        script_end = content.rfind('</script>\\n</body>')
        if script_end == -1:
            script_end = content.rfind('</script>')
            
        js_code = """
    // ==========================================
    // 📩 LEADS & BLOG LOGIC
    // ==========================================
    
    let quill;
    document.addEventListener("DOMContentLoaded", () => {
      if (typeof Quill !== 'undefined') {
        quill = new Quill('#quillEditor', {
          theme: 'snow',
          modules: {
            toolbar: [
              [{ 'header': [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              ['blockquote', 'code-block'],
              [{ 'list': 'ordered'}, { 'list': 'bullet' }],
              [{ 'color': [] }, { 'background': [] }],
              ['link', 'image', 'video'],
              ['clean']
            ]
          }
        });
        // Dark theme tweaks
        document.querySelector('.ql-toolbar').style.borderColor = 'rgba(255,255,255,0.1)';
        document.querySelector('.ql-toolbar').style.backgroundColor = 'rgba(255,255,255,0.05)';
        document.querySelectorAll('.ql-stroke').forEach(el => el.style.stroke = '#9ca3af');
        document.querySelectorAll('.ql-fill').forEach(el => el.style.fill = '#9ca3af');
        document.querySelectorAll('.ql-picker-label').forEach(el => el.style.color = '#9ca3af');
      }
    });

    async function fetchLeads() {
      const adminKey = localStorage.getItem('pa_admin_key');
      const tbody = document.getElementById('leadsTableBody');
      try {
        const res = await fetch('/api/admin/leads', { headers: { 'x-admin-key': adminKey } });
        const data = await res.json();
        if (data.ok && data.leads.length > 0) {
          tbody.innerHTML = data.leads.map(l => `
            <tr class="border-b border-white/5 hover:bg-white/5 transition">
              <td class="px-4 py-3 text-white">${l.email}</td>
              <td class="px-4 py-3">${l.name || '-'}</td>
              <td class="px-4 py-3 text-xs"><span class="px-2 py-1 rounded bg-white/5 text-amber-400">${l.source || 'web'}</span></td>
              <td class="px-4 py-3 text-xs">${new Date(l.createdAt).toLocaleDateString()}</td>
              <td class="px-4 py-3 text-right">
                <button onclick="deleteLead('${l._id}')" class="text-rose-500 hover:text-rose-400 transition cursor-pointer"><i data-feather="trash-2" class="w-4 h-4"></i></button>
              </td>
            </tr>
          `).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-xs">No leads found.</td></tr>';
        }
        if(window.feather) feather.replace();
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-xs text-rose-500">Failed to load leads.</td></tr>';
      }
    }

    async function deleteLead(id) {
      if(!confirm('Delete this lead?')) return;
      const adminKey = localStorage.getItem('pa_admin_key');
      await fetch(`/api/admin/leads/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } });
      fetchLeads();
    }

    function exportLeadsCSV() {
      const adminKey = localStorage.getItem('pa_admin_key');
      window.open(`/api/admin/leads/export-csv?key=${adminKey}`, '_blank');
    }

    async function fetchAdminBlogPosts() {
      const adminKey = localStorage.getItem('pa_admin_key');
      const list = document.getElementById('blogList');
      try {
        const res = await fetch('/api/admin/blog', { headers: { 'x-admin-key': adminKey } });
        const data = await res.json();
        if (data.ok && data.posts.length > 0) {
          list.innerHTML = data.posts.map(p => `
            <div class="bg-black/40 border border-white/5 rounded-xl p-3 hover:border-white/10 transition mb-2">
              <div class="flex justify-between items-start mb-2">
                <h4 class="text-xs font-bold text-white pr-4 leading-tight">${p.title}</h4>
                <div class="flex gap-2">
                  <button onclick="editBlogPost('${p._id}')" class="text-blue-400 hover:text-blue-300 cursor-pointer"><i data-feather="edit-2" class="w-3.5 h-3.5"></i></button>
                  <button onclick="deleteBlogPost('${p._id}')" class="text-rose-500 hover:text-rose-400 cursor-pointer"><i data-feather="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
              </div>
              <div class="flex justify-between items-center text-[10px]">
                <span class="text-gray-500">${new Date(p.publishedAt || Date.now()).toLocaleDateString()}</span>
                <span class="px-1.5 py-0.5 rounded ${p.status==='published'?'bg-emerald-500/20 text-emerald-400':'bg-gray-500/20 text-gray-400'}">${p.status}</span>
              </div>
            </div>
          `).join('');
        } else {
          list.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">No posts found.</p>';
        }
        if(window.feather) feather.replace();
      } catch (err) {}
    }

    async function saveBlogPost(status) {
      const title = document.getElementById('blogTitle').value;
      if(!title) return alert('Title required');
      const payload = {
        title,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
        category: document.getElementById('blogCategory').value,
        author: document.getElementById('blogAuthor').value,
        excerpt: document.getElementById('blogExcerpt').value,
        coverImage: document.getElementById('blogCover').value,
        content: quill.root.innerHTML,
        status
      };
      
      const editId = document.getElementById('blogEditId').value;
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `/api/admin/blog/${editId}` : '/api/admin/blog';
      
      const adminKey = localStorage.getItem('pa_admin_key');
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(payload)
      });
      if(res.ok) {
        alert(editId ? 'Post updated' : 'Post created');
        document.getElementById('blogTitle').value = '';
        document.getElementById('blogCategory').value = '';
        document.getElementById('blogExcerpt').value = '';
        document.getElementById('blogCover').value = '';
        quill.root.innerHTML = '';
        document.getElementById('blogEditId').value = '';
        fetchAdminBlogPosts();
      }
    }

    async function editBlogPost(id) {
      const adminKey = localStorage.getItem('pa_admin_key');
      const res = await fetch('/api/admin/blog', { headers: { 'x-admin-key': adminKey } });
      const data = await res.json();
      const post = data.posts.find(p => p._id === id);
      if(post) {
        document.getElementById('blogEditId').value = post._id;
        document.getElementById('blogTitle').value = post.title || '';
        document.getElementById('blogCategory').value = post.category || '';
        document.getElementById('blogAuthor').value = post.author || 'Pips Attendant';
        document.getElementById('blogExcerpt').value = post.excerpt || '';
        document.getElementById('blogCover').value = post.coverImage || '';
        quill.root.innerHTML = post.content || '';
        window.scrollTo({top: document.getElementById('blogPanel').offsetTop, behavior: 'smooth'});
      }
    }

    async function deleteBlogPost(id) {
      if(!confirm('Delete post?')) return;
      const adminKey = localStorage.getItem('pa_admin_key');
      await fetch(`/api/admin/blog/${id}`, { method: 'DELETE', headers: { 'x-admin-key': adminKey } });
      fetchAdminBlogPosts();
    }
"""
        content = content[:script_end] + js_code + content[script_end:]

    # 5. Patch switchAdminTab
    # Find switchAdminTab function body
    match = re.search(r'function switchAdminTab\(tab\) \{.*?\}(?=\\n\\n|\\s+async function|\\s+function )', content, re.DOTALL)
    if match:
        old_func = match.group(0)
        new_func = """function switchAdminTab(tab) {
      ['dashboardPanel', 'propfirmPanel', 'leadsPanel', 'blogPanel'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
      });
      ['tab-broadcast', 'tab-propfirm', 'tab-leads', 'tab-blog'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
          el.classList.replace('bg-neon-blue/20', 'bg-black/40');
          el.classList.replace('text-neon-blue', 'text-gray-400');
        }
      });
      
      const tabEl = document.getElementById('tab-' + (tab === 'broadcast' ? 'broadcast' : tab));
      if (tabEl) {
        tabEl.classList.replace('bg-black/40', 'bg-neon-blue/20');
        tabEl.classList.replace('text-gray-400', 'text-neon-blue');
      }

      if (tab === 'broadcast') {
        document.getElementById('dashboardPanel').classList.remove('hidden');
      } else if (tab === 'propfirm') {
        document.getElementById('propfirmPanel').classList.remove('hidden');
        loadPropFirmAccounts();
      } else if (tab === 'leads') {
        document.getElementById('leadsPanel').classList.remove('hidden');
        fetchLeads();
      } else if (tab === 'blog') {
        document.getElementById('blogPanel').classList.remove('hidden');
        fetchAdminBlogPosts();
      }
    }"""
        content = content.replace(old_func, new_func)

    with open('admin.html', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    patch_admin()
