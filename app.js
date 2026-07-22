// === Supabase 配置 ===
var SUPABASE_URL = 'https://ptdyuishochwbputdxqj.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_FRskLxx0NthC3LeF8d-WUw_2aOOhDBC';
var sb = null;
var isRemoteUpdate = false;
var syncTimer = null;

// === 初始化 ===
function initSupabase() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || !window.supabase) {
        console.log('Supabase 未配置，运行在本地模式');
        updateSyncStatus('offline', 'Supabase 未配置，当前运行在本地模式。数据仅保存在浏览器中，刷新后丢失。');
        return;
    }
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    updateSyncStatus('connecting', '正在连接 Supabase...');
    setupRealtime();
    loadFromSupabase();
}

function updateSyncStatus(status, message) {
    var badge = document.getElementById('syncStatusBadge');
    var text = document.getElementById('syncStatusText');
    if (badge) {
        if (status === 'online') {
            badge.textContent = '已连接';
            badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-[rgba(52,211,153,0.15)] text-[#34d399] border border-[rgba(52,211,153,0.3)]';
        } else if (status === 'connecting') {
            badge.textContent = '连接中';
            badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-[rgba(251,191,36,0.15)] text-[#fbbf24] border border-[rgba(251,191,36,0.3)]';
        } else {
            badge.textContent = '未连接';
            badge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-hub-surface-elevated text-hub-text-dim border border-hub-border';
        }
    }
    if (text && message) text.textContent = message;
}

function setupRealtime() {
    if (!sb) return;
    sb.channel('public:app_state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, function(payload) {
            if (isRemoteUpdate) return;
            if (payload.new && payload.new.data) {
                applyState(payload.new.data);
            }
        })
        .subscribe(function(status) {
            if (status === 'SUBSCRIBED') {
                updateSyncStatus('online', '已连接 Supabase，数据实时同步中。多人编辑将自动同步到所有设备。');
            }
        });
}

// === 数据同步 ===
function collectState() {
    var state = {};
    var personnelBody = document.getElementById('personnelBody');
    state.personnel = personnelBody ? personnelBody.innerHTML : '';

    var matrixHead = document.getElementById('matrixHead');
    state.matrixHead = matrixHead ? matrixHead.innerHTML : '';

    var matrixBody = document.getElementById('matrixBody');
    state.matrixBody = matrixBody ? matrixBody.innerHTML : '';

    var subAssembly = document.getElementById('subAssemblyRows');
    state.subAssemblyDisplay = subAssembly ? subAssembly.style.display : 'none';

    var perfSub = document.getElementById('perfSubRows');
    state.perfSubDisplay = perfSub ? perfSub.style.display : 'none';

    return state;
}

function applyState(state) {
    if (!state) return;
    isRemoteUpdate = true;

    if (state.personnel) {
        var personnelBody = document.getElementById('personnelBody');
        if (personnelBody) personnelBody.innerHTML = state.personnel;
    }
    if (state.matrixHead) {
        var matrixHead = document.getElementById('matrixHead');
        if (matrixHead) matrixHead.innerHTML = state.matrixHead;
    }
    if (state.matrixBody) {
        var matrixBody = document.getElementById('matrixBody');
        if (matrixBody) matrixBody.innerHTML = state.matrixBody;
    }
    if (state.subAssemblyDisplay !== undefined) {
        var subAssembly = document.getElementById('subAssemblyRows');
        if (subAssembly) subAssembly.style.display = state.subAssemblyDisplay;
        var arrow = document.getElementById('subAssemblyArrow');
        if (arrow) arrow.style.transform = state.subAssemblyDisplay === 'none' ? 'rotate(0deg)' : 'rotate(90deg)';
    }
    if (state.perfSubDisplay !== undefined) {
        var perfSub = document.getElementById('perfSubRows');
        if (perfSub) perfSub.style.display = state.perfSubDisplay;
        var perfArrow = document.getElementById('perfSubArrow');
        if (perfArrow) perfArrow.style.transform = state.perfSubDisplay === 'none' ? 'rotate(0deg)' : 'rotate(90deg)';
    }

    updateDashboardKPIs();
    updateStatsPage();
    isRemoteUpdate = false;
}

function syncToSupabase() {
    if (!sb || isRemoteUpdate) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async function() {
        var state = collectState();
        var { error } = await sb.from('app_state')
            .upsert({ id: 1, data: state, updated_at: new Date().toISOString() });
        if (error) console.error('同步失败:', error);
    }, 500);
}

async function loadFromSupabase() {
    if (!sb) return;
    var { data, error } = await sb.from('app_state').select('data').eq('id', 1).single();
    if (error) {
        if (error.code === 'PGRST116') {
            // 首次使用，上传当前 HTML 状态作为初始数据
            syncToSupabase();
        } else {
            console.error('加载数据失败:', error);
        }
        return;
    }
    if (data && data.data) {
        applyState(data.data);
    }
}

// === 启动 ===
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    updateDashboardKPIs();
    initSupabase();
});

// === KPI 更新 ===
function updateDashboardKPIs() {
    var projThs = document.querySelectorAll('#matrixHead tr th');
    var projectCount = Math.max(0, projThs.length - 2);
    var kpiProjects = document.getElementById('kpi-projects');
    if (kpiProjects) kpiProjects.innerHTML = projectCount + '<span class="kpi-unit">个</span>';

    var allCells = document.querySelectorAll('.matrix-table td[data-status]');
    var activeTasks = 0;
    var errCount = 0;
    allCells.forEach(function(cell) {
        var status = cell.dataset.status;
        if (status && status !== 'na') activeTasks++;
        if (status === 'err') errCount++;
    });

    var selects = document.querySelectorAll('.proj-status-select');
    var activeProjects = [];
    selects.forEach(function(s) {
        if (s.value === '进行中') {
            var th = s.closest('th');
            if (th) {
                var projName = th.childNodes[0].textContent.trim();
                activeProjects.push(projName);
            }
        }
    });
    var kpiTasks = document.getElementById('kpi-tasks');
    if (kpiTasks) {
        kpiTasks.innerHTML = activeProjects.length + '<span class="kpi-unit">个</span>';
        var tooltip = activeProjects.length > 0 ? activeProjects.join('、') : '暂无进行中项目';
        kpiTasks.parentNode.title = tooltip;
    }

    var personnelCount = document.querySelectorAll('#personnelBody tr').length;
    var kpiMembers = document.getElementById('kpi-members');
    if (kpiMembers) kpiMembers.innerHTML = personnelCount + '<span class="kpi-unit">人</span>';

    var totalTasks = allCells.length;
    var anomalyRate = totalTasks > 0 ? (errCount / totalTasks * 100).toFixed(1) : '0.0';
    var kpiAnomalyRate = document.getElementById('kpi-anomaly-rate');
    if (kpiAnomalyRate) kpiAnomalyRate.innerHTML = anomalyRate + '<span class="kpi-unit">%</span>';
    var kpiAnomalyCount = document.getElementById('kpi-anomaly-count');
    if (kpiAnomalyCount) kpiAnomalyCount.textContent = errCount + ' 项异常';
}

// === 页面切换 ===
function switchPage(pageId) {
    document.querySelectorAll('.page-content').forEach(function(el) {
        el.classList.add('hidden');
    });
    document.getElementById('page-' + pageId).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(function(el) {
        el.classList.remove('active');
    });
    document.querySelectorAll('[data-page="' + pageId + '"]').forEach(function(el) {
        el.classList.add('active');
    });

    toggleMobileMenu();
}

function toggleMobileMenu() {
    var nav = document.getElementById('mobileNav');
    var overlay = document.getElementById('mobileNavOverlay');
    if (nav.classList.contains('open')) {
        nav.classList.remove('open');
        overlay.style.display = 'none';
    } else {
        nav.classList.add('open');
        overlay.style.display = 'block';
    }
}

// === 矩阵单元格编辑器 ===
var activePopup = null;
var activeCell = null;
var activeSelectCell = null;

function showCellEditor(e, td, proj, ms) {
    e.stopPropagation();
    if (activePopup) { activePopup.remove(); activePopup = null; }
    activeCell = td;
    var status = td.dataset.status || 'na';
    var pct = td.dataset.pct || '0';
    var note = td.dataset.note || '';
    var rect = td.getBoundingClientRect();
    var popup = document.createElement('div');
    popup.className = 'dts-popup';
    popup.innerHTML = '<div class="popup-row"><label>状态</label><select id="peStatus"><option value="ok"' + (status === 'ok' ? ' selected' : '') + '>✓ 正常</option><option value="warn"' + (status === 'warn' ? ' selected' : '') + '>⚠ 预警</option><option value="err"' + (status === 'err' ? ' selected' : '') + '>× 报警</option><option value="na"' + (status === 'na' ? ' selected' : '') + '>- 未开始</option></select></div><div class="popup-row"><label>百分比</label><input type="text" id="pePct" value="' + pct + '%"></div><div class="popup-row"><label>备注</label><input type="text" id="peNote" value="' + note + '" placeholder="填写备注..."></div><div class="popup-actions"><button class="popup-btn popup-btn-cancel" onclick="closeCellEditor()">取消</button><button class="popup-btn popup-btn-primary" onclick="saveCellEditor()">确定</button></div>';
    document.body.appendChild(popup);
    activePopup = popup;

    var popupRect = popup.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - popupRect.width / 2;
    var top = rect.bottom + 6;
    if (top + popupRect.height > window.innerHeight) top = rect.top - popupRect.height - 6;
    if (left < 0) left = 10;
    if (left + popupRect.width > window.innerWidth) left = window.innerWidth - popupRect.width - 10;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
}

function saveCellEditor() {
    if (!activeCell || !activePopup) return;
    var s = document.getElementById('peStatus').value;
    var p = document.getElementById('pePct').value.replace('%', '');
    var n = document.getElementById('peNote').value;
    activeCell.dataset.status = s;
    activeCell.dataset.pct = p;
    activeCell.dataset.note = n;
    var sym = { ok: '✓', warn: '⚠', err: '✗', na: '-' };
    var colors = { ok: '#34d399', warn: '#fbbf24', err: '#f87171', na: 'var(--hub-text-dim)' };
    var c = colors[s] || colors.na;
    activeCell.querySelector('.dts-cell-display').innerHTML = '<span class="status-cell ' + s + '">' + sym[s] + '</span><span style="font-size:12px;font-weight:600;color:' + c + ';">' + p + '%</span>';
    closeCellEditor();
    updateDashboardKPIs();
    syncToSupabase();
}

function closeCellEditor() {
    if (activePopup) { activePopup.remove(); activePopup = null; }
    activeCell = null;
    activeSelectCell = null;
}

document.addEventListener('click', function(e) {
    if (activePopup && !activePopup.contains(e.target)) {
        closeCellEditor();
    }
});

// === 角色名编辑 ===
function editRoleName(span) {
    var currentText = span.textContent === '-' ? '' : span.textContent;
    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.placeholder = '输入姓名';
    input.style.cssText = 'font-size:12px;padding:2px 6px;border:1px solid var(--hub-primary);border-radius:4px;background:var(--hub-surface-elevated);color:var(--hub-foreground);width:60px;text-align:center;font-family:inherit;outline:none;';
    span.style.display = 'none';
    span.parentNode.insertBefore(input, span.nextSibling);
    input.focus();
    input.select();

    function finish() {
        var val = input.value.trim();
        span.textContent = val || '-';
        span.style.display = '';
        if (input.parentNode) input.remove();
        syncToSupabase();
    }

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = ''; input.blur(); }
    });
}

// === 自定义选项行 ===
function editCustomOptLabel(span) {
    var currentText = span.textContent.replace(/^\+\s*/, '');
    if (currentText === '添加选项') currentText = '';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.placeholder = '输入选项名称';
    input.style.cssText = 'font-size:12px;padding:2px 6px;border:1px solid var(--hub-primary);border-radius:4px;background:var(--hub-surface-elevated);color:var(--hub-foreground);width:90px;font-family:inherit;outline:none;';
    span.style.display = 'none';
    span.parentNode.insertBefore(input, span.nextSibling);
    input.focus();
    input.select();

    function finish() {
        var val = input.value.trim();
        if (val) {
            span.textContent = val;
            span.style.color = 'var(--hub-text-secondary)';
            span.style.borderStyle = 'solid';
            span.style.borderColor = 'var(--hub-border)';
            span.removeAttribute('id');
            span.removeAttribute('onclick');

            var delBtn = document.createElement('span');
            delBtn.className = 'custom-opt-del';
            delBtn.textContent = '×';
            delBtn.title = '删除此行';
            delBtn.onclick = function(e) { e.stopPropagation(); deleteCustomOptRow(span.closest('tr')); };
            span.parentNode.insertBefore(delBtn, span.nextSibling);

            var row = span.closest('tr');
            row.querySelectorAll('td[onclick]').forEach(function(td) {
                var oc = td.getAttribute('onclick');
                td.setAttribute('onclick', oc.replace(/'[^']*'\)$/, "'" + val + "')"));
            });

            var newRow = document.createElement('tr');
            newRow.style.background = 'rgba(79,140,255,0.04)';
            var ths = document.querySelectorAll('#matrixHead tr th');
            var projs = [];
            ths.forEach(function(th, i) {
                if (i > 0 && i < ths.length - 1) projs.push(th.childNodes[0].textContent.trim());
            });
            var html = '<td style="white-space:nowrap;padding-left:24px;"><span id="customOptLabel" style="font-size:12px;color:var(--hub-text-dim);cursor:pointer;border:1px dashed var(--hub-border);border-radius:4px;padding:2px 8px;" onclick="event.stopPropagation();editCustomOptLabel(this)">+ 添加选项</span></td>';
            projs.forEach(function(p) {
                html += '<td style="text-align:center;" onclick="showCellEditor(event,this,\'' + p + '\',\'新选项\')" data-status="na" data-pct="0" data-note=""><span class="dts-cell-display" style="display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;"><span class="status-cell na">-</span><span style="font-size:12px;font-weight:600;color:var(--hub-text-dim);">0%</span></span></td>';
            });
            newRow.innerHTML = html;
            row.parentNode.insertBefore(newRow, row.nextSibling);
        } else {
            span.textContent = '+ 添加选项';
            span.style.color = 'var(--hub-text-dim)';
            span.style.borderStyle = 'dashed';
            span.style.borderColor = 'var(--hub-border)';
        }
        span.style.display = '';
        if (input.parentNode) input.remove();
        syncToSupabase();
    }

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = ''; input.blur(); }
    });
}

function deleteCustomOptRow(row) {
    row.remove();
    syncToSupabase();
}

// === 折叠行 ===
function togglePerfSubRows() {
    var rows = document.getElementById('perfSubRows');
    var arrow = document.getElementById('perfSubArrow');
    if (rows.style.display === 'none') {
        rows.style.display = '';
        arrow.style.transform = 'rotate(90deg)';
    } else {
        rows.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
    syncToSupabase();
}

function toggleSubAssembly() {
    var rows = document.getElementById('subAssemblyRows');
    var arrow = document.getElementById('subAssemblyArrow');
    if (rows.style.display === 'none') {
        rows.style.display = '';
        arrow.style.transform = 'rotate(90deg)';
    } else {
        rows.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
    }
    syncToSupabase();
}

// === 项目状态更新 ===
function updateProjStatus(select) {
    select.dataset.status = select.value;
    select.style.color = select.value === '进行中' ? 'var(--state-success)' : select.value === '暂停' ? 'var(--state-warning)' : 'var(--hub-text-dim)';
    updateDashboardKPIs();
    syncToSupabase();
}

// === 删除项目列 ===
function deleteProjectColumn(btn) {
    var th = btn.closest('th');
    var thIndex = Array.from(th.parentNode.children).indexOf(th);
    if (thIndex < 1) return;

    th.remove();
    var table = document.querySelector('.matrix-table');
    table.querySelectorAll('tbody tr').forEach(function(row) {
        var cells = row.querySelectorAll('td');
        var firstTd = cells[0];
        if (firstTd && firstTd.hasAttribute('colspan') && cells.length === 1) {
            firstTd.colSpan = parseInt(firstTd.colSpan) - 1;
            return;
        }
        if (cells[thIndex]) cells[thIndex].remove();
    });
    updateDashboardKPIs();
    syncToSupabase();
}

// === 新增项目列（表头+按钮） ===
function showAddProjectColumnModal() {
    var name = prompt('输入项目名称');
    if (!name || !name.trim()) return;
    name = name.trim();
    addProjectColumnToTable(name, '规划中');
    updateDashboardKPIs();
    syncToSupabase();
}

function addProjectColumnToTable(name, status) {
    var plusTh = document.querySelector('#matrixHead tr th:last-child');
    var newTh = document.createElement('th');
    newTh.style.cssText = 'text-align:center;min-width:64px;position:relative;';
    var statusColor = status === '进行中' ? 'var(--state-success)' : status === '暂停' ? 'var(--state-warning)' : 'var(--hub-text-dim)';
    newTh.innerHTML = name +
        '<button class="col-del-btn" title="删除项目 ' + name + '" onclick="deleteProjectColumn(this)">&times;</button>' +
        '<select class="proj-status-select" data-status="' + status + '" onchange="updateProjStatus(this)" style="color:' + statusColor + ';"><option' + (status === '进行中' ? ' selected' : '') + '>进行中</option><option' + (status === '暂停' ? ' selected' : '') + '>暂停</option><option' + (status === '规划中' ? ' selected' : '') + '>规划中</option></select>';
    plusTh.parentNode.insertBefore(newTh, plusTh);

    var table = document.querySelector('.matrix-table');
    table.querySelectorAll('tbody tr').forEach(function(row) {
        var cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        var firstTd = cells[0];
        if (firstTd && firstTd.hasAttribute('colspan') && cells.length === 1) {
            firstTd.colSpan = parseInt(firstTd.colSpan) + 1;
            return;
        }

        var newTd = document.createElement('td');
        newTd.style.textAlign = 'center';

        var rowNameEl = row.querySelector('.proj-name');
        var rowName = rowNameEl ? rowNameEl.textContent.trim().replace(/^[├└]\s*/, '').replace(/ ▸.*/, '') : '';

        var lastCell = cells[cells.length - 1];
        if (lastCell && lastCell.dataset && lastCell.dataset.type === 'text') {
            newTd.dataset.type = 'text';
            newTd.setAttribute('onclick', 'showTextEditor(event,this,\'' + name + '\',\'' + rowName + '\')');
            newTd.innerHTML = '<span class="dts-cell-display text-[12px] text-hub-text-dim cursor-pointer" title="点击编辑">-</span>';
        } else if (rowName === '交付') {
            newTd.dataset.type = 'select';
            newTd.setAttribute('onclick', 'showPercentEditor(event,this,\'' + name + '\',\'' + rowName + '\')');
            newTd.innerHTML = '<span class="dts-cell-display text-[12px] font-semibold text-hub-text-dim cursor-pointer" title="点击选择">0%</span>';
        } else if (lastCell && lastCell.dataset && lastCell.dataset.type === 'select') {
            var selectOptions = [];
            if (rowName === '项目阶段') selectOptions = ['造型阶段', '方案阶段', '工艺阶段', 'NC阶段'];
            else if (rowName === '是否完成') selectOptions = ['未评审', '已评审', '部分评审'];
            else selectOptions = ['选项1', '选项2', '选项3'];
            newTd.dataset.type = 'select';
            newTd.setAttribute('onclick', 'showSelectEditor(event,this,\'' + name + '\',\'' + rowName + '\',' + JSON.stringify(selectOptions) + ')');
            newTd.innerHTML = '<span class="dts-cell-display text-[12px] text-hub-text-dim cursor-pointer" title="点击选择">-</span>';
        } else if (lastCell && lastCell.querySelector('.dts-cell-display')) {
            var hasStatus = lastCell.querySelector('.status-cell');
            if (hasStatus) {
                newTd.setAttribute('onclick', 'showCellEditor(event,this,\'' + name + '\',\'' + rowName + '\')');
                newTd.dataset.status = 'na';
                newTd.dataset.pct = '0';
                newTd.dataset.note = '';
                newTd.innerHTML = '<span class="dts-cell-display" style="display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;"><span class="status-cell na">-</span><span style="font-size:12px;font-weight:600;color:var(--hub-text-dim);">0%</span></span>';
            } else {
                newTd.innerHTML = '<span class="dts-cell-display text-[12px] text-hub-text-dim cursor-pointer" title="点击编辑">-</span>';
            }
        } else if (lastCell && lastCell.querySelector('.role-name-cell')) {
            newTd.innerHTML = '<span class="role-name-cell" onclick="editRoleName(this)" style="font-size:12px;color:var(--hub-text-secondary);cursor:pointer;border-bottom:1px dashed transparent;padding-bottom:1px;" title="点击编辑">-</span>';
        } else {
            newTd.innerHTML = '<span class="dts-cell-display text-[12px] text-hub-text-dim cursor-pointer" title="点击编辑">-</span>';
        }
        row.appendChild(newTd);
    });
}

// === 筛选 ===
function filterTable() {
    var dept = document.getElementById('filterDept').value;
    var level = document.getElementById('filterLevel').value;
    var labor = document.getElementById('filterLabor').value;
    var search = document.querySelector('.custom-search').value.trim().toLowerCase();
    var rows = document.querySelectorAll('#personnelBody tr');
    rows.forEach(function(row) {
        var matchDept = !dept || row.dataset.dept === dept;
        var matchLevel = !level || row.dataset.level === level;
        var matchLabor = !labor || row.dataset.labor === labor;
        var matchSearch = !search || row.textContent.toLowerCase().indexOf(search) > -1;
        row.style.display = (matchDept && matchLevel && matchLabor && matchSearch) ? '' : 'none';
    });
}

// === 项目弹窗 ===
function showAddProjectModal() {
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('addProjectModal').style.display = 'block';
    document.getElementById('projectName').focus();
}

function closeModal(modalId) {
    document.getElementById('modalOverlay').style.display = 'none';
    document.getElementById(modalId).style.display = 'none';
}

function addProject() {
    var name = document.getElementById('projectName').value.trim();
    var status = document.getElementById('projectStatus').value;
    if (!name) { alert('请输入项目名称'); return; }

    addProjectColumnToTable(name, status);

    closeModal('addProjectModal');
    document.getElementById('projectName').value = '';
    document.getElementById('projectStatus').value = '进行中';
    updateDashboardKPIs();
    updateStatsPage();
    syncToSupabase();
}

// === 人员库 ===
function showAddPersonnelModal() {
    document.getElementById('personnelModalTitle').textContent = '新增人员';
    document.getElementById('personnelId').value = '';
    document.getElementById('personnelName').value = '';
    document.getElementById('personnelLevel').value = '建模员';
    document.getElementById('personnelAssembly').value = '';
    document.getElementById('personnelDept').value = '上车体';
    document.getElementById('personnelLabor').value = '自有';
    document.getElementById('personnelExpYears').value = '';
    document.getElementById('personnelAge').value = '';
    document.getElementById('personnelProject').value = '';
    document.getElementById('personnelRatio').value = '';
    document.getElementById('personnelStatus').value = '正常';
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('personnelModal').style.display = 'block';
    document.getElementById('personnelName').focus();
}

function editPersonnel(btn) {
    var row = btn.closest('tr');
    var cells = row.querySelectorAll('td');
    document.getElementById('personnelModalTitle').textContent = '编辑人员';
    document.getElementById('personnelId').value = row.rowIndex;
    document.getElementById('personnelName').value = cells[0].textContent.trim();
    document.getElementById('personnelLevel').value = cells[1].textContent.trim();
    document.getElementById('personnelAssembly').value = cells[2].textContent.trim();
    document.getElementById('personnelDept').value = cells[3].textContent.trim();
    document.getElementById('personnelLabor').value = cells[4].textContent.trim();
    document.getElementById('personnelExpYears').value = cells[5].textContent.trim();
    document.getElementById('personnelAge').value = cells[6].textContent.trim();
    document.getElementById('personnelProject').value = cells[7].textContent.trim();
    document.getElementById('personnelRatio').value = cells[8].textContent.trim();
    document.getElementById('personnelStatus').value = cells[9].textContent.trim();
    document.getElementById('modalOverlay').style.display = 'block';
    document.getElementById('personnelModal').style.display = 'block';
}

function savePersonnel() {
    var name = document.getElementById('personnelName').value.trim();
    var level = document.getElementById('personnelLevel').value;
    var assembly = document.getElementById('personnelAssembly').value.trim();
    var dept = document.getElementById('personnelDept').value;
    var labor = document.getElementById('personnelLabor').value;
    var expYears = document.getElementById('personnelExpYears').value.trim();
    var age = document.getElementById('personnelAge').value.trim();
    var project = document.getElementById('personnelProject').value.trim();
    var ratio = document.getElementById('personnelRatio').value.trim();
    var status = document.getElementById('personnelStatus').value;

    if (!name) { alert('请输入姓名'); return; }

    var id = document.getElementById('personnelId').value;
    var tbody = document.getElementById('personnelBody');

    if (id) {
        var row = tbody.rows[id - 1];
        var cells = row.querySelectorAll('td');
        cells[0].innerHTML = '<span class="font-semibold">' + name + '</span>';
        cells[1].textContent = level;
        cells[2].textContent = assembly;
        cells[3].textContent = dept;
        cells[4].textContent = labor;
        cells[5].textContent = expYears;
        cells[5].className = 'text-hub-text-secondary';
        cells[6].textContent = age;
        cells[6].className = 'text-hub-text-secondary';
        cells[7].textContent = project;
        cells[8].textContent = ratio;
        cells[9].textContent = status;
        cells[9].className = status === '正常' ? 'text-state-success' : 'text-state-warning';
        row.dataset.dept = dept;
        row.dataset.level = level;
        row.dataset.labor = labor;
    } else {
        var newRow = document.createElement('tr');
        newRow.dataset.dept = dept;
        newRow.dataset.level = level;
        newRow.dataset.labor = labor;
        var statusClass = status === '正常' ? 'text-state-success' : 'text-state-warning';
        newRow.innerHTML =
            '<td><span class="font-semibold">' + name + '</span></td>' +
            '<td>' + level + '</td>' +
            '<td>' + assembly + '</td>' +
            '<td>' + dept + '</td>' +
            '<td>' + labor + '</td>' +
            '<td class="text-hub-text-secondary">' + expYears + '</td>' +
            '<td class="text-hub-text-secondary">' + age + '</td>' +
            '<td>' + project + '</td>' +
            '<td>' + ratio + '</td>' +
            '<td class="' + statusClass + '">' + status + '</td>' +
            '<td><button onclick="editPersonnel(this)" class="text-hub-text-secondary hover:text-hub-primary transition-colors px-2 py-1 rounded">&#9998; 编辑</button><button onclick="deletePersonnel(this)" class="text-hub-text-secondary hover:text-state-error transition-colors px-2 py-1 rounded">&#10005; 删除</button></td>';
        tbody.appendChild(newRow);
    }

    closeModal('personnelModal');
    updateDashboardKPIs();
    updateStatsPage();
    syncToSupabase();
}

function deletePersonnel(btn) {
    if (confirm('确定要删除该人员吗？')) {
        var row = btn.closest('tr');
        row.remove();
        updateDashboardKPIs();
        updateStatsPage();
        syncToSupabase();
    }
}

// === 统计页面 ===
function updateStatsPage() {
    var rows = document.querySelectorAll('#personnelBody tr');
    var total = rows.length;

    var deptCounts = { '上车体': 0, '下车体': 0, '开闭件': 0 };
    var laborCounts = { '自有': 0, '外协': 0 };
    var levelCounts = { '方案负责人': 0, '总成负责人': 0, '工程师': 0, '建模员': 0 };

    rows.forEach(function(row) {
        deptCounts[row.dataset.dept] = (deptCounts[row.dataset.dept] || 0) + 1;
        laborCounts[row.dataset.labor] = (laborCounts[row.dataset.labor] || 0) + 1;
        levelCounts[row.dataset.level] = (levelCounts[row.dataset.level] || 0) + 1;
    });

    var deptTotal = document.getElementById('deptTotal');
    if (deptTotal) deptTotal.textContent = total;

    var depts = ['上车体', '下车体', '开闭件'];
    depts.forEach(function(dept, i) {
        var count = deptCounts[dept] || 0;
        var pct = total > 0 ? (count / total * 100).toFixed(1) : '0.0';
        var el = document.getElementById('deptCount' + (i + 1));
        if (el) el.textContent = count + ' (' + pct + '%)';
    });

    var laborTotal = document.getElementById('laborTotal');
    if (laborTotal) laborTotal.textContent = total;

    var labors = ['自有', '外协'];
    labors.forEach(function(labor, i) {
        var count = laborCounts[labor] || 0;
        var pct = total > 0 ? (count / total * 100).toFixed(1) : '0.0';
        var el = document.getElementById('laborCount' + (i + 1));
        if (el) el.textContent = count + ' (' + pct + '%)';
    });
}

// === 关闭所有弹窗 ===
function closeAllModals() {
    document.getElementById('modalOverlay').style.display = 'none';
    var modals = document.querySelectorAll('.modal');
    modals.forEach(function(m) { m.style.display = 'none'; });
}

// === 文本编辑器 ===
function showTextEditor(e, td, proj, ms) {
    e.stopPropagation();
    if (activePopup) { activePopup.remove(); activePopup = null; }
    activeCell = td;
    var currentVal = td.querySelector('.dts-cell-display').textContent.trim();
    if (currentVal === '-') currentVal = '';
    var rect = td.getBoundingClientRect();
    var popup = document.createElement('div');
    popup.className = 'dts-popup';
    popup.innerHTML = '<div class="popup-row"><label>' + ms + '</label><input type="text" id="teValue" value="' + currentVal + '" placeholder="输入内容..."></div><div class="popup-actions"><button class="popup-btn popup-btn-cancel" onclick="closeCellEditor()">取消</button><button class="popup-btn popup-btn-primary" onclick="saveTextEditor()">确定</button></div>';
    document.body.appendChild(popup);
    activePopup = popup;

    var popupRect = popup.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - popupRect.width / 2;
    var top = rect.bottom + 6;
    if (top + popupRect.height > window.innerHeight) top = rect.top - popupRect.height - 6;
    if (left < 0) left = 10;
    if (left + popupRect.width > window.innerWidth) left = window.innerWidth - popupRect.width - 10;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    document.getElementById('teValue').focus();
}

function saveTextEditor() {
    if (!activeCell || !activePopup) return;
    var val = document.getElementById('teValue').value.trim();
    var display = activeCell.querySelector('.dts-cell-display');
    if (val) {
        display.textContent = val;
        display.className = 'dts-cell-display text-[12px] text-hub-foreground cursor-pointer';
    } else {
        display.textContent = '-';
        display.className = 'dts-cell-display text-[12px] text-hub-text-dim cursor-pointer';
    }
    closeCellEditor();
    syncToSupabase();
}

// === 百分比编辑器 ===
function showPercentEditor(e, td, proj, ms) {
    e.stopPropagation();
    if (activePopup) { activePopup.remove(); activePopup = null; }
    activeSelectCell = td;
    var currentVal = td.querySelector('.dts-cell-display').textContent.trim().replace('%', '');
    if (currentVal === '-' || currentVal === '') currentVal = '0';
    var rect = td.getBoundingClientRect();
    var popup = document.createElement('div');
    popup.className = 'dts-popup';
    var options = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100'];
    var optionsHtml = '<div class="popup-row"><label>' + ms + '</label><select id="seValue">';
    options.forEach(function(opt) {
        optionsHtml += '<option value="' + opt + '"' + (currentVal === opt ? ' selected' : '') + '>' + opt + '%</option>';
    });
    optionsHtml += '</select></div>';
    popup.innerHTML = optionsHtml + '<div class="popup-actions"><button class="popup-btn popup-btn-cancel" onclick="closeCellEditor()">取消</button><button class="popup-btn popup-btn-primary" onclick="savePercentEditor()">确定</button></div>';
    document.body.appendChild(popup);
    activePopup = popup;

    var popupRect = popup.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - popupRect.width / 2;
    var top = rect.bottom + 6;
    if (top + popupRect.height > window.innerHeight) top = rect.top - popupRect.height - 6;
    if (left < 0) left = 10;
    if (left + popupRect.width > window.innerWidth) left = window.innerWidth - popupRect.width - 10;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
}

function savePercentEditor() {
    if (!activeSelectCell || !activePopup) return;
    var val = document.getElementById('seValue').value;
    var display = activeSelectCell.querySelector('.dts-cell-display');
    var colorClass = 'text-hub-text-dim';
    var pct = parseInt(val);
    if (pct >= 100) colorClass = 'text-[#34d399]';
    else if (pct >= 70) colorClass = 'text-[#4f8cff]';
    else if (pct >= 40) colorClass = 'text-[#fbbf24]';
    else if (pct > 0) colorClass = 'text-[#f87171]';
    display.textContent = val + '%';
    display.className = 'dts-cell-display text-[12px] font-semibold ' + colorClass + ' cursor-pointer';
    closeCellEditor();
    activeSelectCell = null;
    syncToSupabase();
}

// === 下拉选择编辑器 ===
function showSelectEditor(e, td, proj, ms, options) {
    e.stopPropagation();
    if (activePopup) { activePopup.remove(); activePopup = null; }
    activeSelectCell = td;
    var currentVal = td.querySelector('.dts-cell-display').textContent.trim();
    if (currentVal === '-') currentVal = '';
    var rect = td.getBoundingClientRect();
    var popup = document.createElement('div');
    popup.className = 'dts-popup';
    var optionsHtml = '<div class="popup-row"><label>' + ms + '</label><select id="seValue">';
    optionsHtml += '<option value="">-</option>';
    options.forEach(function(opt) {
        optionsHtml += '<option value="' + opt + '"' + (currentVal === opt ? ' selected' : '') + '>' + opt + '</option>';
    });
    optionsHtml += '</select></div>';
    popup.innerHTML = optionsHtml + '<div class="popup-actions"><button class="popup-btn popup-btn-cancel" onclick="closeCellEditor()">取消</button><button class="popup-btn popup-btn-primary" onclick="saveSelectEditor()">确定</button></div>';
    document.body.appendChild(popup);
    activePopup = popup;

    var popupRect = popup.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - popupRect.width / 2;
    var top = rect.bottom + 6;
    if (top + popupRect.height > window.innerHeight) top = rect.top - popupRect.height - 6;
    if (left < 0) left = 10;
    if (left + popupRect.width > window.innerWidth) left = window.innerWidth - popupRect.width - 10;
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
}

function saveSelectEditor() {
    if (!activeSelectCell || !activePopup) return;
    var val = document.getElementById('seValue').value;
    var display = activeSelectCell.querySelector('.dts-cell-display');
    if (val) {
        display.textContent = val;
        var colorClass = 'text-hub-foreground';
        if (val === '已评审') colorClass = 'text-[#34d399]';
        else if (val === '部分评审') colorClass = 'text-[#fbbf24]';
        else if (val === '未评审') colorClass = 'text-[#f87171]';
        else if (val === 'NC阶段') colorClass = 'text-[#a78bfa]';
        else if (val === '工艺阶段') colorClass = 'text-[#4f8cff]';
        else if (val === '方案阶段') colorClass = 'text-[#34d399]';
        else if (val === '造型阶段') colorClass = 'text-[#fbbf24]';
        display.className = 'dts-cell-display text-[12px] font-semibold ' + colorClass + ' cursor-pointer';
    } else {
        display.textContent = '-';
        display.className = 'dts-cell-display text-[12px] text-hub-text-dim cursor-pointer';
    }
    closeCellEditor();
    activeSelectCell = null;
    syncToSupabase();
}

// === 导入导出 ===
function importData() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv';
    input.onchange = function(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
            try {
                var data = JSON.parse(ev.target.result);
                if (data.personnel) {
                    var tbody = document.getElementById('personnelBody');
                    tbody.innerHTML = '';
                    data.personnel.forEach(function(p) {
                        var row = document.createElement('tr');
                        row.dataset.dept = p.dept || '';
                        row.dataset.level = p.level || '';
                        row.dataset.labor = p.labor || '';
                        var statusClass = p.status === '正常' ? 'text-state-success' : 'text-state-warning';
                        row.innerHTML =
                            '<td><span class="font-semibold">' + (p.name || '') + '</span></td>' +
                            '<td>' + (p.level || '') + '</td>' +
                            '<td>' + (p.assembly || '') + '</td>' +
                            '<td>' + (p.dept || '') + '</td>' +
                            '<td>' + (p.labor || '') + '</td>' +
                            '<td class="text-hub-text-secondary">' + (p.expYears || '') + '</td>' +
                            '<td class="text-hub-text-secondary">' + (p.age || '') + '</td>' +
                            '<td>' + (p.project || '') + '</td>' +
                            '<td>' + (p.ratio || '') + '</td>' +
                            '<td class="' + statusClass + '">' + (p.status || '') + '</td>' +
                            '<td><button onclick="editPersonnel(this)" class="text-hub-text-secondary hover:text-hub-primary transition-colors px-2 py-1 rounded">&#9998; 编辑</button><button onclick="deletePersonnel(this)" class="text-hub-text-secondary hover:text-state-error transition-colors px-2 py-1 rounded">&#10005; 删除</button></td>';
                        tbody.appendChild(row);
                    });
                }
                updateDashboardKPIs();
                updateStatsPage();
                syncToSupabase();
                alert('数据导入成功！');
            } catch (err) {
                alert('导入失败：文件格式错误，请使用JSON格式');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function exportData() {
    var rows = document.querySelectorAll('#personnelBody tr');
    var personnel = [];
    rows.forEach(function(row) {
        var cells = row.querySelectorAll('td');
        personnel.push({
            name: cells[0] ? cells[0].textContent.trim() : '',
            level: cells[1] ? cells[1].textContent.trim() : '',
            assembly: cells[2] ? cells[2].textContent.trim() : '',
            dept: row.dataset.dept || '',
            labor: row.dataset.labor || '',
            expYears: cells[5] ? cells[5].textContent.trim() : '',
            age: cells[6] ? cells[6].textContent.trim() : '',
            project: cells[7] ? cells[7].textContent.trim() : '',
            ratio: cells[8] ? cells[8].textContent.trim() : '',
            status: cells[9] ? cells[9].textContent.trim() : ''
        });
    });

    var matrixData = {};
    var ths = document.querySelectorAll('#matrixHead tr th');
    var projects = [];
    ths.forEach(function(th, i) {
        if (i > 0 && i < ths.length - 1) projects.push(th.childNodes[0].textContent.trim());
    });
    matrixData.projects = projects;

    var allCells = document.querySelectorAll('.matrix-table td[data-status]');
    var cellData = [];
    allCells.forEach(function(cell) {
        cellData.push({ status: cell.dataset.status, pct: cell.dataset.pct, note: cell.dataset.note || '' });
    });
    matrixData.cells = cellData;

    var exportObj = { personnel: personnel, matrix: matrixData, exportTime: new Date().toISOString() };
    var json = JSON.stringify(exportObj, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '协同看板数据_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
