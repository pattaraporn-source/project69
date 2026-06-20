/**
 * Executive Project Dashboard - Ban Huay Kaew Samakkhi Tham School
 * Author: Antigravity Coding Assistant
 * Date: 2026-06-20
 */

// Global Application State
let allProjects = [];
let filteredProjects = [];
let currentTheme = 'light';
let activeSortColumn = 'id';
let isSortAscending = true;

// Chart.js Instances
let statusChartInstance = null;
let departmentChartInstance = null;

// Google Sheet Source URL (Visualization API JSON endpoint)
const SHEET_JSON_URL = 'https://docs.google.com/spreadsheets/d/1EG3or33NgMtIlPpCXndoq9_toCzYk11K4moYrLVtS30/gviz/tq?tqx=out:json';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadDashboardData();
    setupEventListeners();
});

// Setup DOM Event Listeners
function setupEventListeners() {
    // Search Box Input
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    
    searchInput.addEventListener('input', () => {
        if (searchInput.value.trim() !== '') {
            clearSearchBtn.style.display = 'flex';
        } else {
            clearSearchBtn.style.display = 'none';
        }
        applyFilters();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        applyFilters();
        searchInput.focus();
    });

    // Filters Dropdowns
    document.getElementById('filter-department').addEventListener('change', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);
    
    // Reset Filters Button
    document.getElementById('reset-filters-btn').addEventListener('click', resetFilters);

    // Theme Toggle Button
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);

    // Sync button (Spin icon) trigger reload
    document.getElementById('sync-icon').addEventListener('click', () => {
        document.getElementById('sync-icon').classList.add('spinning');
        loadDashboardData();
    });

    // Table Header Sorting
    const headers = document.querySelectorAll('.project-table th.sortable');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            handleSort(column);
        });
    });
}

// Initialize Theme (Dark/Light)
function initTheme() {
    const savedTheme = localStorage.getItem('dashboard-theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
}

// Set Theme
function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dashboard-theme', theme);

    const darkIcon = document.querySelector('.dark-icon');
    const lightIcon = document.querySelector('.light-icon');

    if (theme === 'dark') {
        darkIcon.style.display = 'none';
        lightIcon.style.display = 'block';
    } else {
        darkIcon.style.display = 'block';
        lightIcon.style.display = 'none';
    }

    // Refresh charts if they are initialized to adapt to new theme colors
    updateChartsThemeColors();
}

// Toggle Theme
function toggleTheme() {
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
}

// Global JSONP Callback setup for Google Sheets
window.google = {
    visualization: {
        Query: {
            setResponse: function(data) {
                handleLiveSheetData(data);
            }
        }
    }
};

// Load Data via JSONP (Bypasses CORS completely for local file:// previews)
function loadDashboardData() {
    const loader = document.getElementById('loader-overlay');
    loader.classList.remove('fade-out');
    
    // Create script tag dynamically
    const script = document.createElement('script');
    script.id = 'google-sheet-jsonp';
    script.src = SHEET_JSON_URL + '&t=' + Date.now();
    
    // Remove previous script if any to prevent memory bloat
    const oldScript = document.getElementById('google-sheet-jsonp');
    if (oldScript) {
        oldScript.remove();
    }
    
    // Error handling for script loading (e.g., offline or wrong URL)
    script.onerror = function(err) {
        console.error('Failed to load Google Sheet data:', err);
        alert('ไม่สามารถเชื่อมต่อดึงข้อมูลจาก Google Sheets ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตหรือความถูกต้องของลิงก์');
        loader.classList.add('fade-out');
        document.getElementById('sync-icon').classList.remove('spinning');
    };
    
    document.body.appendChild(script);
}

// Handler for Google Sheets visualization response
function handleLiveSheetData(data) {
    const loader = document.getElementById('loader-overlay');
    
    try {
        if (!data || !data.table || !data.table.rows || !data.table.cols) {
            throw new Error('โครงสร้างไฟล์ข้อมูลใน Google Sheet ไม่ถูกต้อง');
        }
        
        const cols = data.table.cols;
        const rows = data.table.rows;
        
        // Dynamically find index for each column title to support sheet rearrangement
        const headerIndices = {
            id: cols.findIndex(c => c && c.label && c.label.includes('รหัส')),
            name: cols.findIndex(c => c && c.label && c.label.includes('ชื่อ')),
            manager: cols.findIndex(c => c && c.label && c.label.includes('ผู้รับผิดชอบ')),
            department: cols.findIndex(c => c && c.label && c.label.includes('กลุ่มงาน')),
            budget: cols.findIndex(c => c && c.label && c.label.includes('งบประมาณ')),
            spent: cols.findIndex(c => c && c.label && c.label.includes('ใช้ไป')),
            remaining: cols.findIndex(c => c && c.label && c.label.includes('คงเหลือ')),
            progress: cols.findIndex(c => c && c.label && c.label.includes('คืบหน้า')),
            status: cols.findIndex(c => c && c.label && c.label.includes('สถานะ'))
        };

        const getIndex = (key, defaultIdx) => headerIndices[key] !== -1 ? headerIndices[key] : defaultIdx;

        const idxId = getIndex('id', 0);
        const idxName = getIndex('name', 1);
        const idxManager = getIndex('manager', 2);
        const idxDept = getIndex('department', 3);
        const idxBudget = getIndex('budget', 4);
        const idxSpent = getIndex('spent', 5);
        const idxRemaining = getIndex('remaining', 6);
        const idxProgress = getIndex('progress', 7);
        const idxStatus = getIndex('status', 8);
        
        // Map the rows into clean JS objects
        allProjects = rows.map((row, index) => {
            if (!row || !row.c) return null;
            const cells = row.c;
            
            const getVal = (cell) => (cell && cell.v !== null && cell.v !== undefined) ? cell.v : null;
            const getStr = (cell, fallback) => {
                const val = getVal(cell);
                return val !== null ? String(val).trim() : fallback;
            };
            const getNum = (cell, fallback = 0) => {
                const val = getVal(cell);
                return val !== null ? Number(val) : fallback;
            };
            
            const idCell = cells[idxId];
            const id = idCell ? (typeof idCell.v === 'number' ? idCell.v : parseInt(idCell.f || idCell.v || (index + 1))) : (index + 1);
            const name = getStr(cells[idxName], 'ไม่มีชื่อโครงการ');
            const manager = getStr(cells[idxManager], 'ไม่ได้ระบุ');
            const department = getStr(cells[idxDept], 'ทั่วไป');
            const budget = getNum(cells[idxBudget], 0);
            const spent = getNum(cells[idxSpent], 0);
            const remaining = getNum(cells[idxRemaining], budget - spent);
            const progress = getNum(cells[idxProgress], 0);
            const status = getStr(cells[idxStatus], 'ยังไม่ดำเนินการ');

            return { id, name, manager, department, budget, spent, remaining, progress, status };
        }).filter(Boolean);
        
        // Populate Dynamic Filters
        populateDepartmentFilter();
        
        // Update dashboard content
        updateDashboard();
        
        // Show update timestamp
        updateSyncTime();
        
    } catch (error) {
        console.error('Error parsing live Google Sheets data:', error);
        alert('เกิดข้อผิดพลาดในการวิเคราะห์โครงสร้างข้อมูล: ' + error.message);
    } finally {
        setTimeout(() => {
            loader.classList.add('fade-out');
            document.getElementById('sync-icon').classList.remove('spinning');
        }, 600);
    }
}

// Populate Department Filter dynamically based on spreadsheet values
function populateDepartmentFilter() {
    const deptSelect = document.getElementById('filter-department');
    // Save current selected value if any
    const currentValue = deptSelect.value;
    
    // Clear existing dynamic options (keep first one)
    deptSelect.innerHTML = '<option value="">ทุกกลุ่มงาน</option>';
    
    // Extract unique departments
    const departments = [...new Set(allProjects.map(p => p.department))].filter(Boolean).sort();
    
    departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        deptSelect.appendChild(option);
    });
    
    // Restore selected value
    if (departments.includes(currentValue)) {
        deptSelect.value = currentValue;
    }
}

// Update Sync Time
function updateSyncTime() {
    const timeSpan = document.getElementById('sync-time-text');
    const now = new Date();
    
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: false 
    };
    
    timeSpan.textContent = `อัปเดตเมื่อ: ${now.toLocaleDateString('th-TH', options)} น.`;
}

// Update Dashboard (KPIs, Charts, Table)
function updateDashboard() {
    // Reset filters state
    filteredProjects = [...allProjects];
    
    // Process filter states
    applyFilters();
}

// Apply Filters & Search
function applyFilters() {
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    const deptVal = document.getElementById('filter-department').value;
    const statusVal = document.getElementById('filter-status').value;

    filteredProjects = allProjects.filter(project => {
        // Search condition
        const matchesSearch = !searchVal || 
            String(project.id).includes(searchVal) ||
            project.name.toLowerCase().includes(searchVal) ||
            project.manager.toLowerCase().includes(searchVal) ||
            project.department.toLowerCase().includes(searchVal);
            
        // Department condition
        const matchesDept = !deptVal || project.department === deptVal;
        
        // Status condition
        const matchesStatus = !statusVal || project.status === statusVal;
        
        return matchesSearch && matchesDept && matchesStatus;
    });

    // Re-sort and render
    sortAndRender();
    
    // Update KPI metrics based on current filtered dataset or overall?
    // Usually, KPIs show overall project statistics, but let's calculate based on ALL projects 
    // to give executives the high-level picture, or filtered?
    // Let's calculate KPIs based on ALL projects so the school overview stays stable, 
    // and show a note, or base them on filtered? Base on ALL projects, as KPIs represent the "Whole School" targets.
    // Let's implement full metrics based on ALL projects.
    calculateMetrics(allProjects);
    
    // Refresh visual charts (they should represent the overall state OR filtered? 
    // Let's make them represent overall state or filtered state? 
    // Making them represent the overall state is standard, but filtered makes the charts interactive!
    // Interactive charts that update based on filters is extremely premium!)
    renderCharts(filteredProjects);
}

// Reset Filters
function resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('clear-search-btn').style.display = 'none';
    document.getElementById('filter-department').value = '';
    document.getElementById('filter-status').value = '';
    
    applyFilters();
}

// Calculate Metrics (KPI Cards)
function calculateMetrics(projects) {
    if (!projects || projects.length === 0) return;

    const totalProjects = projects.length;
    let totalBudget = 0;
    let totalSpent = 0;
    let totalRemaining = 0;
    let totalProgressSum = 0;
    let completedCount = 0;

    projects.forEach(p => {
        totalBudget += p.budget;
        totalSpent += p.spent;
        totalRemaining += p.remaining;
        totalProgressSum += p.progress;
        
        if (p.status === 'ดำเนินการแล้ว') {
            completedCount++;
        }
    });

    const avgProgress = totalProjects > 0 ? (totalProgressSum / totalProjects) : 0;
    const spentBudgetPercent = totalBudget > 0 ? ((totalSpent / totalBudget) * 100) : 0;
    const remainingBudgetPercent = totalBudget > 0 ? ((totalRemaining / totalBudget) * 100) : 0;

    // Set DOM elements
    document.getElementById('stat-total-projects').textContent = totalProjects;
    document.getElementById('stat-total-budget').textContent = formatThaiBaht(totalBudget);
    document.getElementById('stat-total-spent').textContent = formatThaiBaht(totalSpent);
    document.getElementById('stat-total-remaining').textContent = formatThaiBaht(totalRemaining);
    document.getElementById('stat-avg-progress').textContent = `${avgProgress.toFixed(1)}%`;

    // Spent progress bar
    document.getElementById('budget-percentage').textContent = `เบิกจ่ายแล้ว ${spentBudgetPercent.toFixed(1)}%`;
    document.getElementById('budget-progress-bar').style.width = `${spentBudgetPercent}%`;

    // Spent details subtext
    document.getElementById('spent-percentage').textContent = `คิดเป็น ${spentBudgetPercent.toFixed(1)}% ของงบทั้งหมด`;
    document.getElementById('remaining-percentage').textContent = `คิดเป็น ${remainingBudgetPercent.toFixed(1)}% คงเหลือใช้สอย`;

    // Progress details subtext
    document.getElementById('completed-projects-count').textContent = `ดำเนินงานสำเร็จแล้ว ${completedCount} จาก ${totalProjects} โครงการ`;
    document.getElementById('overall-progress-bar').style.width = `${avgProgress}%`;
}

// Sorting logic
function handleSort(column) {
    if (activeSortColumn === column) {
        // Toggle direction
        isSortAscending = !isSortAscending;
    } else {
        activeSortColumn = column;
        isSortAscending = true;
    }
    
    // Update header icons visual representation
    updateSortIcons();
    
    // Sort and render table
    sortAndRender();
}

// Update sorting icons in headers
function updateSortIcons() {
    const headers = document.querySelectorAll('.project-table th.sortable');
    headers.forEach(header => {
        const col = header.getAttribute('data-sort');
        const icon = header.querySelector('i');
        
        if (col === activeSortColumn) {
            header.classList.add('active-sort');
            if (isSortAscending) {
                icon.setAttribute('data-lucide', 'chevron-up');
            } else {
                icon.setAttribute('data-lucide', 'chevron-down');
            }
        } else {
            header.classList.remove('active-sort');
            icon.setAttribute('data-lucide', 'chevrons-up-down');
        }
    });
    // Re-initialize dynamic icons
    lucide.createIcons();
}

// Sort filtered dataset and render table rows
function sortAndRender() {
    filteredProjects.sort((a, b) => {
        let valA = a[activeSortColumn];
        let valB = b[activeSortColumn];
        
        // Handle Thai locale string sorting for name, manager, department, status
        if (typeof valA === 'string' && typeof valB === 'string') {
            return isSortAscending 
                ? valA.localeCompare(valB, 'th') 
                : valB.localeCompare(valA, 'th');
        }
        
        // Handle numeric sorting for budget, spent, remaining, progress, id
        if (valA === valB) return 0;
        return isSortAscending 
            ? (valA < valB ? -1 : 1) 
            : (valA > valB ? -1 : 1);
    });

    renderTable();
}

// Render Table Rows
function renderTable() {
    const tableBody = document.getElementById('project-table-body');
    const noDataMsg = document.getElementById('no-data-msg');
    
    tableBody.innerHTML = '';
    
    if (filteredProjects.length === 0) {
        noDataMsg.style.display = 'block';
        return;
    } else {
        noDataMsg.style.display = 'none';
    }

    filteredProjects.forEach(project => {
        const row = document.createElement('tr');
        
        // Determine status badge class
        let badgeClass = 'badge-pending';
        if (project.status === 'อยู่ระหว่างดำเนินการ') {
            badgeClass = 'badge-progress';
        } else if (project.status === 'ดำเนินการแล้ว') {
            badgeClass = 'badge-completed';
        }

        row.innerHTML = `
            <td class="id-col">${project.id}</td>
            <td class="name-col">${project.name}</td>
            <td>${project.department}</td>
            <td>${project.manager}</td>
            <td class="numeric">${formatThaiBaht(project.budget)}</td>
            <td class="numeric">${formatThaiBaht(project.spent)}</td>
            <td class="numeric">${formatThaiBaht(project.remaining)}</td>
            <td class="progress-col">
                <div class="progress-cell-wrapper">
                    <div class="progress-bar-outer">
                        <div class="progress-bar-inner" style="width: ${project.progress}%; background-color: ${getProgressColor(project.progress)};"></div>
                    </div>
                    <span class="progress-percent-text">${project.progress}%</span>
                </div>
            </td>
            <td class="text-center">
                <span class="badge ${badgeClass}">${project.status}</span>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Helper: Get Progress Bar Color based on %
function getProgressColor(percent) {
    if (percent === 100) return '#059669'; // Emerald (Done)
    if (percent > 40) return '#3b82f6'; // Indigo/Blue (Good Progress)
    if (percent > 0) return '#f59e0b'; // Amber (In progress/Beginning)
    return '#94a3b8'; // Slate/Gray (Not started)
}

// Helper: Format number to Thai Baht Currency
function formatThaiBaht(num) {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
}

// Render Charts
function renderCharts(projects) {
    // 1. PROJECT STATUS CHART (DOUGHNUT)
    renderStatusChart(projects);
    
    // 2. BUDGET BY DEPARTMENT CHART (BAR)
    renderDepartmentChart(projects);
}

// Render Status Doughnut Chart
function renderStatusChart(projects) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    // Count project statuses
    let pending = 0;
    let progress = 0;
    let completed = 0;
    
    projects.forEach(p => {
        if (p.status === 'ยังไม่ดำเนินการ') pending++;
        else if (p.status === 'อยู่ระหว่างดำเนินการ') progress++;
        else if (p.status === 'ดำเนินการแล้ว') completed++;
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
    
    // Destroy previous chart instance if exists
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }
    
    // Status colors
    const colors = {
        pending: isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
        progress: isDark ? 'rgba(245, 158, 11, 0.75)' : 'rgba(217, 119, 6, 0.75)',
        completed: isDark ? 'rgba(52, 211, 153, 0.8)' : 'rgba(5, 150, 105, 0.8)'
    };
    const borderColors = {
        pending: isDark ? '#64748b' : '#94a3b8',
        progress: isDark ? '#d97706' : '#fbbf24',
        completed: isDark ? '#059669' : '#34d399'
    };

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['ยังไม่ดำเนินการ', 'อยู่ระหว่างดำเนินการ', 'ดำเนินการแล้ว'],
            datasets: [{
                data: [pending, progress, completed],
                backgroundColor: [colors.pending, colors.progress, colors.completed],
                borderColor: [borderColors.pending, borderColors.progress, borderColors.completed],
                borderWidth: 1.5,
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: {
                            family: 'Sarabun',
                            size: 13
                        },
                        padding: 18
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const val = context.raw;
                            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                            return ` ${context.label}: ${val} โครงการ (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '62%',
            layout: {
                padding: 10
            }
        }
    });
}

// Render Budget vs Spent Bar Chart
function renderDepartmentChart(projects) {
    const ctx = document.getElementById('departmentChart').getContext('2d');
    
    // Group budget/spent by department
    const deptSummary = {};
    
    projects.forEach(p => {
        const dept = p.department || 'ทั่วไป';
        if (!deptSummary[dept]) {
            deptSummary[dept] = { budget: 0, spent: 0 };
        }
        deptSummary[dept].budget += p.budget;
        deptSummary[dept].spent += p.spent;
    });
    
    const departments = Object.keys(deptSummary).sort();
    const budgets = departments.map(d => deptSummary[d].budget);
    const spents = departments.map(d => deptSummary[d].spent);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
    
    if (departmentChartInstance) {
        departmentChartInstance.destroy();
    }
    
    departmentChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: departments,
            datasets: [
                {
                    label: 'งบประมาณจัดสรร',
                    data: budgets,
                    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.65)' : 'rgba(30, 58, 138, 0.75)',
                    borderColor: isDark ? '#60a5fa' : '#1e3a8a',
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: 'ใช้ไปแล้ว',
                    data: spents,
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.65)' : 'rgba(185, 28, 28, 0.75)',
                    borderColor: isDark ? '#f87171' : '#b91c1c',
                    borderWidth: 1.5,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: {
                        color: 'transparent'
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            family: 'Sarabun',
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            family: 'Sarabun',
                            size: 11
                        },
                        callback: function(value) {
                            return value >= 1000 ? (value / 1000) + 'k ฿' : value + ' ฿';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: {
                            family: 'Sarabun',
                            size: 12
                        },
                        boxWidth: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            return ` ${context.dataset.label}: ${formatThaiBaht(val)}`;
                        }
                    }
                }
            }
        }
    });
}

// Update charts themes on theme switch
function updateChartsThemeColors() {
    if (!statusChartInstance || !departmentChartInstance) return;
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
    
    // Update Status Chart Colors
    const statusLegend = statusChartInstance.options.plugins.legend.labels;
    statusLegend.color = textColor;
    
    const statusDataset = statusChartInstance.data.datasets[0];
    const colors = {
        pending: isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
        progress: isDark ? 'rgba(245, 158, 11, 0.75)' : 'rgba(217, 119, 6, 0.75)',
        completed: isDark ? 'rgba(52, 211, 153, 0.8)' : 'rgba(5, 150, 105, 0.8)'
    };
    const borderColors = {
        pending: isDark ? '#64748b' : '#94a3b8',
        progress: isDark ? '#d97706' : '#fbbf24',
        completed: isDark ? '#059669' : '#34d399'
    };
    
    statusDataset.backgroundColor = [colors.pending, colors.progress, colors.completed];
    statusDataset.borderColor = [borderColors.pending, borderColors.progress, borderColors.completed];
    statusChartInstance.update();

    // Update Department Chart Colors
    const deptOptions = departmentChartInstance.options;
    deptOptions.scales.x.ticks.color = textColor;
    deptOptions.scales.y.ticks.color = textColor;
    deptOptions.scales.y.grid.color = gridColor;
    deptOptions.plugins.legend.labels.color = textColor;
    
    const deptDataset0 = departmentChartInstance.data.datasets[0];
    const deptDataset1 = departmentChartInstance.data.datasets[1];
    
    deptDataset0.backgroundColor = isDark ? 'rgba(59, 130, 246, 0.65)' : 'rgba(30, 58, 138, 0.75)';
    deptDataset0.borderColor = isDark ? '#60a5fa' : '#1e3a8a';
    
    deptDataset1.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.65)' : 'rgba(185, 28, 28, 0.75)';
    deptDataset1.borderColor = isDark ? '#f87171' : '#b91c1c';
    
    departmentChartInstance.update();
}
