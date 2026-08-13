import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Anchor,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Group,
    Image as MantineImage,
    NativeSelect,
    SimpleGrid,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    VisuallyHidden,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import useAdminSession from '../hooks/useAdminSession';

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

function normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resizeSheetImage(file) {
    return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(file);
        const image = document.createElement('img');

        image.onload = () => {
            const maxDimension = 2600;
            const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');

            if (!context) {
                URL.revokeObjectURL(imageUrl);
                reject(new Error('This browser cannot prepare the sheet image'));
                return;
            }

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                URL.revokeObjectURL(imageUrl);
                if (!blob) {
                    reject(new Error('Unable to prepare the sheet image'));
                    return;
                }
                resolve(new File([blob], 'registration-sheet.jpg', { type: 'image/jpeg' }));
            }, 'image/jpeg', 0.9);
        };

        image.onerror = () => {
            URL.revokeObjectURL(imageUrl);
            reject(new Error('The selected image could not be opened'));
        };
        image.src = imageUrl;
    });
}

function SheetImportPage({ classes, trackTypes, onRegistrationsChanged }) {
    const [selectedTrack, setSelectedTrack] = useState('');
    const [sourceFile, setSourceFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [rows, setRows] = useState([]);
    const [raceClasses, setRaceClasses] = useState([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [hasAnalyzed, setHasAnalyzed] = useState(false);
    const [analysisModel, setAnalysisModel] = useState('');
    const [error, setError] = useState('');
    const [importResult, setImportResult] = useState(null);
    const cameraInputRef = useRef(null);
    const uploadInputRef = useRef(null);
    const {
        fetchAdmin,
        isAuthenticated,
        isCheckingAuth,
        readError,
    } = useAdminSession();

    const availableTracks = useMemo(() => trackTypes
        .filter(track => track.enabled && classes.some(item => item.type === track.name))
        .map(track => track.name), [classes, trackTypes]);

    useEffect(() => {
        if (!availableTracks.includes(selectedTrack)) {
            setSelectedTrack(availableTracks[0] || '');
        }
    }, [availableTracks, selectedTrack]);

    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    const duplicateNames = useMemo(() => {
        const counts = rows.reduce((result, row) => {
            if (!row.included) return result;
            const name = normalizeName(`${row.firstName} ${row.lastName}`);
            if (name) result[name] = (result[name] || 0) + 1;
            return result;
        }, {});
        return new Set(Object.entries(counts).filter(([, count]) => count > 1).map(([name]) => name));
    }, [rows]);

    const includedRows = rows.filter(row => row.included);
    const hasInvalidRows = includedRows.some(row =>
        !row.firstName.trim() ||
        !row.lastName.trim() ||
        row.classes.length === 0 ||
        duplicateNames.has(normalizeName(`${row.firstName} ${row.lastName}`))
    );

    const chooseFile = file => {
        if (!file) return;
        if (file.size > MAX_SOURCE_IMAGE_BYTES) {
            setError('Choose a photo smaller than 20 MB.');
            return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSourceFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        setRows([]);
        setRaceClasses([]);
        setAnalysisModel('');
        setHasAnalyzed(false);
        setImportResult(null);
        setError('');
    };

    const analyze = async () => {
        if (!sourceFile || !selectedTrack) return;
        setIsAnalyzing(true);
        setHasAnalyzed(false);
        setError('');
        setImportResult(null);

        try {
            const preparedFile = await resizeSheetImage(sourceFile);
            const formData = new FormData();
            formData.append('trackName', selectedTrack);
            formData.append('sheet', preparedFile);
            const response = await fetchAdmin('/admin/sheet-import/analyze', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new Error(await readError(response, `Sheet analysis failed with status ${response.status}`));
            }

            const data = await response.json();
            setRows(Array.isArray(data.rows) ? data.rows : []);
            setRaceClasses(Array.isArray(data.raceClasses) ? data.raceClasses : []);
            setAnalysisModel(data.model || 'GPT');
            setHasAnalyzed(true);
            if (!data.rows?.length) {
                setError('GPT did not find any completed racer rows. Retake the photo or add a row manually.');
            }
        } catch (analysisError) {
            setError(analysisError.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const updateRow = (id, changes) => {
        setRows(current => current.map(row => (
            row.id === id ? { ...row, ...changes } : row
        )));
    };

    const updateName = (id, field, value) => {
        updateRow(id, {
            [field]: value,
            existingDriver: null,
            isNewDriver: true,
            warnings: [],
        });
    };

    const selectSuggestion = (id, suggestion) => {
        updateRow(id, {
            firstName: suggestion.firstName,
            lastName: suggestion.lastName,
            existingDriver: {
                firstName: suggestion.firstName,
                lastName: suggestion.lastName,
            },
            isNewDriver: false,
            warnings: [],
        });
    };

    const toggleClass = (row, className) => {
        const nextClasses = row.classes.includes(className)
            ? row.classes.filter(item => item !== className)
            : [...row.classes, className];
        updateRow(row.id, { classes: nextClasses, warnings: [] });
    };

    const addBlankRow = () => {
        setRows(current => [...current, {
            id: `manual-${Date.now()}-${current.length}`,
            rowNumber: current.length + 1,
            rawName: '',
            firstName: '',
            lastName: '',
            nameConfidence: 1,
            classes: [],
            crossedOut: false,
            crossedOutClasses: [],
            existingDriver: null,
            suggestions: [],
            isNewDriver: true,
            included: true,
            notes: 'Added manually during verification',
            warnings: [],
        }]);
    };

    const commitImport = async () => {
        if (!includedRows.length || hasInvalidRows) return;
        setIsImporting(true);
        setError('');

        try {
            const response = await fetchAdmin('/admin/sheet-import/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trackName: selectedTrack,
                    rows: rows.map(row => ({
                        included: row.included,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        classes: row.classes,
                    })),
                }),
            });
            if (!response.ok) {
                throw new Error(await readError(response, `Import failed with status ${response.status}`));
            }
            const result = await response.json();
            setImportResult(result);
            if (onRegistrationsChanged) onRegistrationsChanged();
        } catch (importError) {
            setError(importError.message);
        } finally {
            setIsImporting(false);
        }
    };

    const downloadCsv = async () => {
        if (!importResult?.downloadUrl) return;
        try {
            const response = await fetchAdmin(importResult.downloadUrl);
            if (!response.ok) {
                throw new Error(await readError(response, `Download failed with status ${response.status}`));
            }
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filenameMatch?.[1] || `${selectedTrack} Race Registrations.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch (downloadError) {
            setError(downloadError.message);
        }
    };

    if (isCheckingAuth) {
        return <Text c="dimmed">Checking admin access...</Text>;
    }

    if (!isAuthenticated) {
        return (
            <Alert color="yellow">
                Sign in on the <Anchor component={Link} to="/admin">Admin page</Anchor> to scan a registration sheet.
            </Alert>
        );
    }

    return (
        <Stack pb="xl" gap="lg">
            <Group justify="space-between" align="center">
                <div>
                    <Title order={1} size="h4">Scan Registration Sheet</Title>
                    <Text c="dimmed">Photograph one track sheet, then verify every racer before importing.</Text>
                </div>
                <Button component={Link} to="/admin" variant="default">Back to Admin</Button>
            </Group>

            {error ? <Alert color="red" role="alert">{error}</Alert> : null}
            {importResult ? (
                <Alert color="green" role="status">
                    <Text>
                        Imported {importResult.importedCount} racer{importResult.importedCount === 1 ? '' : 's'}.
                        {' '}{importResult.newDriverCount} new driver{importResult.newDriverCount === 1 ? '' : 's'} added.
                    </Text>
                    <Button color="green" size="xs" mt="sm" onClick={downloadCsv}>
                        Download {selectedTrack} CSV
                    </Button>
                </Alert>
            ) : null}

            <Card withBorder>
                    <Group align="end" wrap="wrap">
                            <NativeSelect
                                id="sheet-track"
                                label="Track"
                                value={selectedTrack}
                                onChange={event => {
                                    setSelectedTrack(event.currentTarget.value);
                                    setRows([]);
                                    setHasAnalyzed(false);
                                    setImportResult(null);
                                }}
                                data={availableTracks.length === 0
                                    ? [{ value: '', label: 'No open tracks with classes' }]
                                    : availableTracks}
                            />
                            <VisuallyHidden>
                              <input
                                ref={cameraInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={event => {
                                    chooseFile(event.target.files?.[0]);
                                    event.target.value = '';
                                }}
                              />
                            </VisuallyHidden>
                            <Button
                                disabled={!selectedTrack}
                                onClick={() => cameraInputRef.current?.click()}
                            >
                                Use Phone Camera
                            </Button>
                            <VisuallyHidden>
                              <input
                                ref={uploadInputRef}
                                type="file"
                                accept="image/*"
                                onChange={event => {
                                    chooseFile(event.target.files?.[0]);
                                    event.target.value = '';
                                }}
                              />
                            </VisuallyHidden>
                            <Button
                                variant="light"
                                disabled={!selectedTrack}
                                onClick={() => uploadInputRef.current?.click()}
                            >
                                Choose Existing Photo
                            </Button>
                    </Group>

                    {previewUrl ? (
                        <Stack mt="md" align="flex-start">
                            <MantineImage
                                src={previewUrl}
                                alt="Registration sheet awaiting analysis"
                                radius="md"
                                fit="contain"
                                mah={420}
                            />
                                <Button
                                    color="green"
                                    loading={isAnalyzing}
                                    onClick={analyze}
                                >
                                    {isAnalyzing ? 'Reading Sheet with GPT...' : 'Analyze with GPT'}
                                </Button>
                        </Stack>
                    ) : null}
            </Card>

            {hasAnalyzed ? (
                <Stack component="section" aria-labelledby="verify-sheet-title" gap="md">
                    <Group justify="space-between" align="center">
                        <div>
                            <Title id="verify-sheet-title" order={2} size="h5">Verify Extracted Racers</Title>
                            <Text c="dimmed" size="sm">
                                Read by {analysisModel}. Correct every uncertain field before importing.
                            </Text>
                        </div>
                        <Button variant="light" size="xs" onClick={addBlankRow}>
                            Add Missed Racer
                        </Button>
                    </Group>

                    {rows.length === 0 ? (
                        <Alert color="yellow">
                            No rows were detected. Retake the photo or use “Add Missed Racer” to enter the sheet manually.
                        </Alert>
                    ) : null}

                    <Stack gap="md">
                        {rows.map((row, rowIndex) => {
                            const normalizedRowName = normalizeName(`${row.firstName} ${row.lastName}`);
                            const isDuplicate = row.included && duplicateNames.has(normalizedRowName);
                            const rowInvalid = row.included && (
                                !row.firstName.trim() || !row.lastName.trim() || !row.classes.length || isDuplicate
                            );
                            return (
                                <Card key={row.id} withBorder style={rowInvalid ? { borderColor: 'var(--mantine-color-yellow-6)' } : undefined}>
                                        <Group justify="space-between" align="flex-start" mb="md">
                                            <div>
                                                <Text fw={700}>Sheet row {row.rowNumber || rowIndex + 1}</Text>
                                                {row.rawName ? <Text c="dimmed" size="sm">GPT read: {row.rawName}</Text> : null}
                                                {row.crossedOut ? <Badge color="red" mt="xs">Scratch-out detected — excluded</Badge> : null}
                                            </div>
                                                <Switch
                                                    id={`include-row-${row.id}`}
                                                    label="Include"
                                                    checked={row.included}
                                                    onChange={event => updateRow(row.id, { included: event.currentTarget.checked })}
                                                />
                                        </Group>

                                        <Box component="fieldset" disabled={!row.included} className="mantine-fieldset-reset">
                                            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                                    <TextInput
                                                        id={`first-name-${row.id}`}
                                                        label="First name"
                                                        value={row.firstName}
                                                        onChange={event => updateName(row.id, 'firstName', event.currentTarget.value)}
                                                    />
                                                    <TextInput
                                                        id={`last-name-${row.id}`}
                                                        label="Last name"
                                                        value={row.lastName}
                                                        onChange={event => updateName(row.id, 'lastName', event.currentTarget.value)}
                                                    />
                                            </SimpleGrid>

                                            {row.suggestions?.length ? (
                                                <Group mt="sm" gap="xs">
                                                    <Text size="sm" c="dimmed">Database matches:</Text>
                                                    {row.suggestions.map(suggestion => (
                                                        <Button
                                                            key={`${suggestion.firstName}-${suggestion.lastName}`}
                                                            variant="default"
                                                            size="xs"
                                                            onClick={() => selectSuggestion(row.id, suggestion)}
                                                        >
                                                            {suggestion.firstName} {suggestion.lastName}
                                                        </Button>
                                                    ))}
                                                </Group>
                                            ) : null}

                                            <Stack mt="md" gap="xs">
                                                <Text fw={500}>Race classes</Text>
                                                <Group gap="md">
                                                    {raceClasses.map((raceClass, classIndex) => {
                                                        const checkboxId = `row-${rowIndex}-class-${classIndex}`;
                                                        return (
                                                                <Checkbox
                                                                    key={raceClass.name}
                                                                    id={checkboxId}
                                                                    label={raceClass.name}
                                                                    checked={row.classes.includes(raceClass.name)}
                                                                    onChange={() => toggleClass(row, raceClass.name)}
                                                                />
                                                        );
                                                    })}
                                                </Group>
                                            </Stack>
                                        </Box>

                                        {row.included ? (
                                            <Group mt="md" gap="xs">
                                                <Badge color={row.existingDriver ? 'green' : 'cyan'}>
                                                    {row.existingDriver ? 'Existing driver' : 'New driver — will be added after verification'}
                                                </Badge>
                                                {isDuplicate ? <Badge color="yellow">Duplicate racer on this sheet</Badge> : null}
                                                {row.warnings?.map(warning => (
                                                    <Badge key={warning} color="yellow">{warning}</Badge>
                                                ))}
                                                {row.notes ? <Text size="sm" c="dimmed">GPT note: {row.notes}</Text> : null}
                                            </Group>
                                        ) : null}
                                </Card>
                            );
                        })}
                    </Stack>

                    <Group mt="md">
                        <Button
                            color="green"
                            loading={isImporting}
                            disabled={isImporting || !includedRows.length || hasInvalidRows}
                            onClick={commitImport}
                        >
                            {isImporting ? 'Importing...' : 'Confirm Verified Import'}
                        </Button>
                        {hasInvalidRows ? (
                            <Text c="yellow.8" size="sm">
                                Resolve missing names, missing race selections, and duplicate racers before importing.
                            </Text>
                        ) : null}
                    </Group>
                </Stack>
            ) : null}

            <Text c="dimmed" size="sm">
                GPT suggestions can be wrong. Verification is required before data is saved.{' '}
                <Anchor href="https://developers.openai.com/api/docs/guides/images-vision" target="_blank" rel="noreferrer">
                    OpenAI image-understanding documentation
                </Anchor>
            </Text>
        </Stack>
    );
}

export default SheetImportPage;
