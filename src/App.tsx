import { useState, useEffect, useRef } from 'react';
import * as vkBridgeModule from '@vkontakte/vk-bridge';
import { View, Panel, PanelHeader, PanelHeaderBack, Group, Cell, Avatar, Spinner, Button, Div, Title, Text, SimpleCell, SplitLayout, SplitCol, FormItem, Input, Switch, SegmentedControl, Search, ModalRoot, ModalCard } from '@vkontakte/vkui';
import { Icon28PaymentCardOutline, Icon28UserOutline, Icon28GiftOutline, Icon28ListOutline, Icon28DownloadOutline, Icon28QrCodeOutline } from '@vkontakte/icons';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import axios from 'axios';

const vkBridge = vkBridgeModule.default || vkBridgeModule;

const API_URL = "https://vape-loyalty-shop.duckdns.org";
const APP_URL = "https://frosya4.github.io/Vapeshop";

interface UserData {
  id: number;
  vk_id: number;
  first_name: string;
  last_name: string;
  balance: number;
  status: string;
  referral_code: string;
  is_admin?: boolean;
  is_cashier?: boolean;
}

interface ClientData {
  id: number;
  vk_id: number;
  tg_id: number;
  full_name: string;
  phone: string;
  balance: number;
  status: string;
  referral_code: string;
  registered_at: string;
}

interface TransactionData {
  id: number;
  client_name: string;
  client_vk_id: number;
  amount: number;
  points_change: number;
  description: string;
  date: string;
  cashier_name?: string | null;
  cashier_vk_id?: number | null;
}

function App() {
  const [activePanel, setActivePanel] = useState('main');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [clients, setClients] = useState<ClientData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [adminTab, setAdminTab] = useState<'users' | 'transactions'>('users');
  const [selectedClient, setSelectedClient] = useState<ClientData | null>(null);
  const [clientRole, setClientRole] = useState<string>('user');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Scanner state
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [scanTargetData, setScanTargetData] = useState<UserData | null>(null);
  const [transactionAmount, setTransactionAmount] = useState<string>('');
  const [isDeducting, setIsDeducting] = useState<boolean>(false);

  // Camera QR scanner state
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string>('');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [transactionTimestamp, setTransactionTimestamp] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTargetData() {
      if (!scanTarget) {
        setScanTargetData(null);
        return;
      }
      try {
        const res = await axios.get(`${API_URL}/api/user/${scanTarget}`);
        setScanTargetData(res.data);
        setTransactionTimestamp(null); // Сброс времени при новом сканировании
      } catch (e) {
        console.error("Target user not found");
        setScanTargetData(null);
      }
    }
    fetchTargetData();
  }, [scanTarget]);

  // Функция открытия сканера QR-кода
  const openScanner = () => {
    setScannerError('');
    setIsScannerModalOpen(true);
  };

  // Инициализация сканера при открытии модального окна
  useEffect(() => {
    if (isScannerModalOpen && !scannerRef.current) {
      setTimeout(() => {
        const scanner = new Html5QrcodeScanner(
          "qr-reader",
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
          },
          false
        );

        scannerRef.current = scanner;

        scanner.render(
          (decodedText) => {
            // Успешное сканирование
            handleQRCodeScanned(decodedText);
            scanner.clear();
            scannerRef.current = null;
            setIsScannerModalOpen(false);
          },
          (error) => {
            // Ошибка сканирования (игнорируем, это нормально при плохом освещении)
            console.warn("QR scan error:", error);
          }
        );
      }, 100);
    }

    // Очистка сканера при закрытии
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    };
  }, [isScannerModalOpen]);

  // Обработка отсканированного QR-кода
  const handleQRCodeScanned = (decodedText: string) => {
    console.log("QR Code scanned:", decodedText);

    // Извлекаем VK ID из URL (формат: https://.../#scan_123456)
    let vkId = null;

    // Пробуем найти паттерн #scan_XXXXX
    const scanMatch = decodedText.match(/#scan_(\d+)/);
    if (scanMatch) {
      vkId = scanMatch[1];
    } else {
      // Пробуем найти просто цифры в конце URL
      const urlMatch = decodedText.match(/(\d+)$/);
      if (urlMatch) {
        vkId = urlMatch[1];
      }
    }

    if (vkId) {
      setScanTarget(vkId);
      window.location.hash = `#scan_${vkId}`;
      setActivePanel('scanner');
    } else {
      setScannerError('Неверный формат QR-кода. Ожидается код клиента.');
    }
  };

  useEffect(() => {
    async function fetchData() {
      // Check if URL has a scan anchor
      const hash = window.location.hash;
      let initialScanTarget = null;
      if (hash.startsWith('#scan_')) {
        initialScanTarget = hash.replace('#scan_', '');
        setScanTarget(initialScanTarget);
      }

      try {
        let userId = null;
        try {
          const user = await vkBridge.send('VKWebAppGetUserInfo');
          userId = user.id;
        } catch (bridgeError) {
          console.warn("VK Bridge unavailable, using manual ID or mock");
          // Проверяем, есть ли сохраненный ID кассира в браузере
          const savedId = localStorage.getItem('cashier_vk_id');
          if (savedId) {
            userId = parseInt(savedId);
          } else {
            // Если нет, просим ввести (или используем заглушку для теста)
            const inputId = prompt("Вы открыли приложение вне ВК. Введите ваш VK ID для авторизации как кассира:", "");
            if (inputId) {
              userId = parseInt(inputId);
              localStorage.setItem('cashier_vk_id', inputId);
            }
          }
        }

        if (!userId) {
          setError('Авторизация не удалась. Откройте приложение через ВК или введите ID.');
          setLoading(false);
          return;
        }

        const res = await axios.get(`${API_URL}/api/user/${userId}`);
        setUserData(res.data);

        // If user is admin/cashier AND they just scanned a QR code (URL hash)
        if ((res.data.is_admin || res.data.is_cashier) && initialScanTarget) {
          setActivePanel('scanner');
        }
      } catch (e: any) {
        setError('Не удалось загрузить данные профиля. Убедитесь, что сервер uvicorn (main.py) запущен на порту 8000.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const copyRefLink = async () => {
    if (!userData) return;
    const link = `https://vk.me/public206577473?ref=${userData.referral_code}`;
    try {
      await vkBridge.send("VKWebAppCopyText", { text: link });
    } catch {
      navigator.clipboard.writeText(link);
    }
    alert("Ссылка скопирована!");
  };

  const loadAdminData = async () => {
    setActivePanel('admin');
    if (!userData) return;
    setLoading(true);
    try {
      const [resUsers, resTx] = await Promise.all([
        axios.get(`${API_URL}/api/admin/users?admin_id=${userData.vk_id}`),
        axios.get(`${API_URL}/api/admin/transactions?admin_id=${userData.vk_id}`)
      ]);
      setClients(resUsers.data);
      setTransactions(resTx.data);
    } catch {
      setError('Ошибка доступа к админ-панели');
    } finally {
      setLoading(false);
    }
  };

  const openClientDetails = (client: ClientData) => {
    setSelectedClient(client);
    setActivePanel('client_details');
    axios.get(`${API_URL}/api/user/${client.vk_id}`).then(res => {
      if (res.data.is_admin) setClientRole('admin');
      else if (res.data.is_cashier) setClientRole('cashier');
      else setClientRole('user');
    });
  };

  const setRole = async (targetVkId: number, role: string) => {
    if (!userData) return;
    try {
      await axios.post(`${API_URL}/api/admin/set_role`, {
        admin_id: userData.vk_id,
        target_vk_id: targetVkId,
        role
      });
      setClientRole(role);
      alert(`Роль успешно изменена!`);
    } catch {
      alert('Ошибка при смене роли.');
    }
  };

  const downloadCSV = () => {
    const headers = ["ID", "VK/TG ID", "Имя", "Телефон", "Баланс", "Статус", "Реф. код", "Дата рег."];
    const rows = clients.map(c => [
      c.id, `VK:${c.vk_id || ''}/TG:${c.tg_id || ''}`, c.full_name, c.phone || '', c.balance, c.status, c.referral_code, c.registered_at
    ]);
    let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "AiHookah_Clients.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTransactionsCSV = async () => {
    if (!userData || !userData.is_admin) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/admin/transactions?admin_id=${userData.vk_id}`);
      const headers = ["ID", "Дата", "Клиент", "VK ID", "Сумма чека", "Начислено/Списано баллов", "Описание"];
      const rows = res.data.map((t: any) => [
        t.id, t.date, t.client_name, t.client_vk_id, t.amount, t.points_change, t.description
      ]);
      let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map((e: any) => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "AiHookah_Transactions.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert("Ошибка при выгрузке транзакций.");
    } finally {
      setLoading(false);
    }
  };

  const processTransaction = async () => {
    if (!userData || !scanTarget || !transactionAmount) return;
    setLoading(true);

    const now = new Date();
    const timestamp = now.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    setTransactionTimestamp(timestamp);

    let amount = parseFloat(transactionAmount);
    if (isDeducting) {
      amount = -Math.abs(amount); // Deduct
    } else {
      amount = Math.abs(amount); // Add
    }

    try {
      const res = await axios.post(`${API_URL}/api/admin/transaction`, {
        admin_id: userData.vk_id,
        client_vk_id: parseInt(scanTarget),
        amount: amount
      });
      alert(`✅ Успешно!\n${res.data.message}\nНовый баланс клиента: ${res.data.new_balance}\n⏰ Время: ${timestamp}`);
      setActivePanel('main');
      setScanTarget(null);
      setTransactionAmount('');
      setIsDeducting(false);
      setTransactionTimestamp(null);
      window.location.hash = ''; // Clear hash
    } catch (e: any) {
      alert("Ошибка обработки: " + (e.response?.data?.detail || e.message));
      setTransactionTimestamp(null);
    } finally {
      setLoading(false);
    }
  };

  const modal = (
    <ModalRoot activeModal={isScannerModalOpen ? 'qr-scanner' : undefined}>
      <ModalCard
        id="qr-scanner"
        onClose={() => {
          setIsScannerModalOpen(false);
          if (scannerRef.current) {
            scannerRef.current.clear();
            scannerRef.current = null;
          }
        }}
        actions={
          <Button
            size="l"
            mode="secondary"
            onClick={() => {
              setIsScannerModalOpen(false);
              if (scannerRef.current) {
                scannerRef.current.clear();
                scannerRef.current = null;
              }
            }}
          >
            Закрыть
          </Button>
        }
      >
        <Div style={{ textAlign: 'center' }}>
          <Title level="2" style={{ marginBottom: 8 }}>📷 Сканирование QR-кода</Title>
          <Text style={{ marginBottom: 16, color: '#8e8e93' }}>
            Наведите камеру на QR-код клиента
          </Text>
          <div id="qr-reader" style={{ width: '100%', maxWidth: 400, margin: '0 auto' }} />
          {scannerError && (
            <Text style={{ marginTop: 16, color: '#ff5252' }}>
              ⚠️ {scannerError}
            </Text>
          )}
        </Div>
      </ModalCard>
    </ModalRoot>
  );

  if (loading && activePanel === 'main') {
    return (
      <SplitLayout>
        <SplitCol>
          <View activePanel="spinner">
            <Panel id="spinner">
              <PanelHeader>AiHookah Store</PanelHeader>
              <Group style={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size="l" />
              </Group>
            </Panel>
          </View>
        </SplitCol>
      </SplitLayout>
    );
  }

  return (
    <SplitLayout
      header={<PanelHeader delimiter="none" />}
      modal={modal}
    >
      <SplitCol>
        <View activePanel={activePanel}>
          <Panel id="main">
            <PanelHeader>Лояльность</PanelHeader>

            {error && (
              <Group>
                <Div><Text style={{ color: '#ff5252', textAlign: 'center' }}>{error}</Text></Div>
              </Group>
            )}

            {userData && (
              <>
                <Group>
                  <Cell
                    before={<Avatar size={72} src="" fallbackIcon={<Icon28UserOutline />} />}
                    subtitle={userData.status}
                  >
                    <Title level="2">{userData.first_name} {userData.last_name}</Title>
                  </Cell>
                </Group>

                <Group>
                  <Div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, #1c1c1e, #2c2c2e)',
                    borderRadius: 20,
                    margin: 16,
                    padding: 32,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
                  }}>
                    <Title level="3" style={{ color: '#ffffff', marginBottom: 8 }}>Моя Карта AiHookah</Title>
                    <Text style={{ color: '#8e8e93', marginBottom: 24 }}>Предъявите код на кассе</Text>

                    <div style={{ background: '#ffffff', padding: 16, borderRadius: 16, marginBottom: 24 }}>
                      <QRCodeSVG
                        value={`${APP_URL}/#scan_${userData.vk_id}`}
                        size={180}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Icon28PaymentCardOutline style={{ color: '#0a84ff' }} width={42} height={42} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <Text style={{ color: '#8e8e93', fontSize: 13 }}>Доступно баллов</Text>
                        <Title level="1" style={{ color: '#ffffff', fontSize: '2.5rem', lineHeight: '1.2' }}>{userData.balance}</Title>
                      </div>
                    </div>
                  </Div>
                </Group>

                <Group>
                  <Div>
                    <Button
                      size="l"
                      stretched
                      mode="secondary"
                      before={<Icon28GiftOutline />}
                      onClick={copyRefLink}
                    >
                      Пригласить друга (+50 баллов)
                    </Button>
                  </Div>
                </Group>

                {(userData.is_admin || userData.is_cashier) && (
                  <Group>
                    <Div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="l"
                        stretched
                        mode="secondary"
                        before={<Icon28PaymentCardOutline />}
                        onClick={() => { setScanTarget(null); setActivePanel('scanner'); }}
                      >
                        Открыть кассу
                      </Button>
                      {userData.is_admin && (
                        <Button
                          size="l"
                          stretched
                          mode="primary"
                          appearance="accent"
                          before={<Icon28ListOutline />}
                          onClick={loadAdminData}
                        >
                          Админ
                        </Button>
                      )}
                    </Div>
                  </Group>
                )}
              </>
            )}
          </Panel>

          <Panel id="admin">
            <PanelHeader before={<PanelHeaderBack onClick={() => setActivePanel('main')} />}>
              База клиентов
            </PanelHeader>

            <Group>
              <Div>
                <SegmentedControl
                  size="l"
                  name="adminTab"
                  value={adminTab}
                  onChange={(value) => setAdminTab(value as 'users' | 'transactions')}
                  options={[
                    { label: 'Клиенты', value: 'users' },
                    { label: 'Транзакции', value: 'transactions' }
                  ]}
                />
              </Div>
            </Group>

            <Search
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={adminTab === 'users' ? 'Поиск по имени, ID, телефону...' : 'Поиск по покупателю, ID...'}
              after={null}
            />

            {adminTab === 'users' && (
              <Group>
                <Div>
                  <Button size="m" mode="secondary" before={<Icon28DownloadOutline />} onClick={downloadCSV}>
                    Скачать .csv
                  </Button>
                </Div>
                <Title level="3" style={{ margin: '0 16px 8px 16px' }}>Список клиентов</Title>
                {loading ? (
                  <Spinner size="l" />
                ) : (
                  clients
                    .filter(c =>
                      c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (c.vk_id && c.vk_id.toString().includes(searchQuery)) ||
                      (c.phone && c.phone.includes(searchQuery))
                    )
                    .map(client => (
                      <SimpleCell
                        key={client.id}
                        onClick={() => openClientDetails(client)}
                        subtitle={`VK ID: ${client.vk_id} | Баланс: ${client.balance}`}
                        after={<Text style={{ color: '#8e8e93' }}>{client.registered_at}</Text>}
                      >
                        {client.full_name}
                      </SimpleCell>
                    ))
                )}
              </Group>
            )}

            {adminTab === 'transactions' && (
              <Group>
                <Div>
                  <Button size="m" mode="secondary" before={<Icon28DownloadOutline />} onClick={downloadTransactionsCSV}>
                    Скачать .csv
                  </Button>
                </Div>
                <Title level="3" style={{ margin: '0 16px 8px 16px' }}>История операций</Title>
                {loading ? (
                  <Spinner size="l" />
                ) : (
                  transactions
                    .filter(t =>
                      t.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (t.client_vk_id && t.client_vk_id.toString().includes(searchQuery)) ||
                      t.description.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(tx => (
                      <SimpleCell
                        key={tx.id}
                        subtitle={`${tx.description} | ${tx.date}${tx.cashier_name ? ` | Кассир: ${tx.cashier_name}` : ''}`}
                        after={
                          <Text style={{
                            color: tx.points_change > 0 ? '#4bb34b' : '#ff3347',
                            fontWeight: 'bold',
                            textAlign: 'right'
                          }}>
                            {tx.points_change > 0 ? '+' : ''}{tx.points_change}
                          </Text>
                        }
                      >
                        {tx.client_name}
                        <Div style={{ padding: 0, marginTop: 4, color: '#8e8e93', fontSize: 13 }}>Чек: {tx.amount}₽</Div>
                      </SimpleCell>
                    ))
                )}
              </Group>
            )}
          </Panel>

          <Panel id="client_details">
            <PanelHeader before={<PanelHeaderBack onClick={() => setActivePanel('admin')} />}>
              Карточка клиента
            </PanelHeader>

            {selectedClient && (
              <Group>
                <SimpleCell
                  before={<Avatar size={72} fallbackIcon={<Icon28UserOutline />} />}
                  subtitle={`VK ID: ${selectedClient.vk_id} | Реф. код: ${selectedClient.referral_code}`}
                >
                  <Title level="2">{selectedClient.full_name}</Title>
                  <Text style={{ color: '#8e8e93' }}>{selectedClient.phone || 'Телефон не указан'} | Статус: {selectedClient.status}</Text>
                  <Title level="3" style={{ marginTop: 8, color: '#0a84ff' }}>Баланс: {selectedClient.balance} баллов</Title>
                </SimpleCell>

                <FormItem top="Роль пользователя">
                  <SegmentedControl
                    size="m"
                    name="clientRole"
                    value={clientRole}
                    onChange={(v) => {
                      const newRole = v as string;
                      if (window.confirm(`Сменить роль пользователя на "${newRole === 'admin' ? 'Админ' : newRole === 'cashier' ? 'Кассир' : 'Обычный'}"?`)) {
                        setRole(selectedClient.vk_id, newRole);
                      }
                    }}
                    options={[
                      { label: 'Обычный', value: 'user' },
                      { label: 'Кассир', value: 'cashier' },
                      { label: 'Админ', value: 'admin' },
                    ]}
                  />
                </FormItem>

                <Div>
                  <Button size="l" stretched mode="primary" onClick={() => { setActivePanel('main'); setScanTarget(selectedClient.vk_id.toString()); window.location.hash = `#scan_${selectedClient.vk_id}`; }}>
                    Открыть кассу для клиента
                  </Button>
                </Div>
              </Group>
            )}

            <Group>
              <Title level="3" style={{ margin: '16px 16px 8px 16px' }}>История операций</Title>
              {selectedClient && transactions.filter(t => t.client_vk_id === selectedClient.vk_id).length === 0 ? (
                <Div><Text style={{ color: '#8e8e93', textAlign: 'center' }}>Нет ни одной операции</Text></Div>
              ) : (
                selectedClient && transactions.filter(t => t.client_vk_id === selectedClient.vk_id).map(tx => (
                  <SimpleCell
                    key={tx.id}
                    subtitle={`${tx.description} | ${tx.date}${tx.cashier_name ? ` | Кассир: ${tx.cashier_name}` : ''}`}
                    after={
                      <Text style={{
                        color: tx.points_change > 0 ? '#4bb34b' : '#ff3347',
                        fontWeight: 'bold',
                        textAlign: 'right'
                      }}>
                        {tx.points_change > 0 ? '+' : ''}{tx.points_change}
                      </Text>
                    }
                  >
                    Чек: {tx.amount}₽
                  </SimpleCell>
                ))
              )}
            </Group>
          </Panel>

          <Panel id="scanner">
            <PanelHeader before={<PanelHeaderBack onClick={() => { setActivePanel('main'); setScanTarget(null); window.location.hash = ''; setIsDeducting(false); }} />}>
              Касса AiHookah
            </PanelHeader>

            {!scanTarget && !scanTargetData ? (
              <Group>
                <Div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <Title level="3" style={{ marginBottom: 8 }}>Поиск клиента</Title>
                  <Text style={{ color: '#8e8e93' }}>Отсканируйте QR-код или введите VK ID вручную</Text>
                </Div>

                {/* Кнопка сканирования QR-кода камерой */}
                <Div>
                  <Button
                    size="l"
                    stretched
                    mode="primary"
                    before={<Icon28QrCodeOutline />}
                    onClick={openScanner}
                  >
                    📷 Сканировать QR-код камерой
                  </Button>
                </Div>

                <Div style={{ display: 'flex', alignItems: 'center', margin: '16px 0' }}>
                  <Div style={{ flex: 1, height: 1, background: '#e1e3e6', opacity: 0.5 }} />
                  <Text style={{ margin: '0 12px', color: '#8e8e93' }}>или</Text>
                  <Div style={{ flex: 1, height: 1, background: '#e1e3e6', opacity: 0.5 }} />
                </Div>

                <FormItem top="VK ID покупателя">
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    placeholder="Например: 532232600"
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      if (val) { setScanTarget(val); window.location.hash = `#scan_${val}`; }
                    }}
                  />
                </FormItem>
              </Group>
            ) : scanTargetData ? (
              <Group>
                {userData && (
                  <Div style={{ textAlign: 'right', paddingBottom: 0 }}>
                    <Text style={{ color: '#007aff', fontWeight: 'bold' }}>
                      👤 Кассир: {userData.first_name} {userData.last_name}
                    </Text>
                  </Div>
                )}

                <SimpleCell
                  before={<Avatar size={48} fallbackIcon={<Icon28UserOutline />} />}
                  subtitle={`ID: ${scanTargetData.vk_id} | Баланс: ${scanTargetData.balance}`}
                >
                  <Title level="3">{scanTargetData.first_name}</Title>
                </SimpleCell>

                <FormItem>
                  <SimpleCell
                    after={<Switch checked={isDeducting} onChange={(e) => setIsDeducting(e.target.checked)} />}
                    subtitle="Укажите сумму для СПИСАНИЯ баллов вместо оплаты"
                  >
                    Оплатить баллами
                  </SimpleCell>
                </FormItem>

                <FormItem top={isDeducting ? "Сумма списания (баллов)" : "Сумма чека (рублей)"}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    value={transactionAmount}
                    onChange={e => {
                      const val = e.target.value.replace(/,/g, '.');
                      setTransactionAmount(val);
                    }}
                    placeholder={isDeducting ? "Например: 200" : "Например: 1500"}
                  />
                  {isDeducting ? (
                    <Text style={{ marginTop: 8, color: '#8e8e93', fontSize: 13 }}>
                      Будет списано: {transactionAmount || 0} баллов. Остаток: {Math.max(0, scanTargetData.balance - (parseFloat(transactionAmount) || 0))}
                    </Text>
                  ) : (
                    <Text style={{ marginTop: 8, color: '#8e8e93', fontSize: 13 }}>
                      Будет начислено: {((parseFloat(transactionAmount) || 0) * 0.03).toFixed(2)} баллов (3%)
                    </Text>
                  )}
                </FormItem>

                {/* Отображение времени последней транзакции */}
                {transactionTimestamp && (
                  <Div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <Text style={{ color: '#4bb34b', fontWeight: 'bold' }}>
                      ⏰ Последняя операция: {transactionTimestamp}
                    </Text>
                  </Div>
                )}

                <Div>
                  <Button
                    size="l"
                    stretched
                    mode="primary"
                    onClick={processTransaction}
                    disabled={loading || !transactionAmount || isNaN(parseFloat(transactionAmount)) || (isDeducting && parseFloat(transactionAmount) > scanTargetData.balance)}
                  >
                    {loading ? <Spinner size="s" /> : (isDeducting ? "Списать баллы" : "Провести чек")}
                  </Button>
                </Div>
              </Group>
            ) : (
              <Group style={{ height: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size="l" />
              </Group>
            )}
          </Panel>
        </View>
      </SplitCol>
    </SplitLayout>
  );
}

export default App;
